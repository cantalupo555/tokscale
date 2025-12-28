use super::{cache, aliases};
use super::litellm::ModelPricing;
use std::collections::HashMap;
use serde::Deserialize;

const CACHE_FILENAME: &str = "pricing-openrouter.json";

#[derive(Deserialize)]
struct EndpointPricing {
    prompt: String,
    completion: String,
    input_cache_read: Option<String>,
    input_cache_write: Option<String>,
}

#[derive(Deserialize)]
struct Endpoint {
    provider_name: String,
    pricing: EndpointPricing,
}

#[derive(Deserialize)]
struct EndpointsData {
    endpoints: Vec<Endpoint>,
}

#[derive(Deserialize)]
struct EndpointsResponse {
    data: EndpointsData,
}

pub fn load_cached() -> Option<HashMap<String, ModelPricing>> {
    cache::load_cache(CACHE_FILENAME)
}

async fn fetch_model_endpoints(
    client: &reqwest::Client,
    author: &str,
    slug: &str,
) -> Option<ModelPricing> {
    let url = format!("https://openrouter.ai/api/v1/models/{}/{}/endpoints", author, slug);
    
    let response = client.get(&url)
        .header("Content-Type", "application/json")
        .send()
        .await
        .ok()?;
    
    if !response.status().is_success() {
        return None;
    }
    
    let data: EndpointsResponse = response.json().await.ok()?;
    
    let expected_provider = aliases::OPENROUTER_PROVIDER_NAMES
        .get(author)
        .copied()
        .unwrap_or(author);
    
    let endpoint = data.data.endpoints.iter()
        .find(|e| e.provider_name.eq_ignore_ascii_case(expected_provider))?;
    
    let input_cost: f64 = endpoint.pricing.prompt.parse().ok()?;
    let output_cost: f64 = endpoint.pricing.completion.parse().ok()?;
    
    if input_cost < 0.0 || output_cost < 0.0 {
        return None;
    }
    
    Some(ModelPricing {
        input_cost_per_token: Some(input_cost),
        output_cost_per_token: Some(output_cost),
        cache_read_input_token_cost: endpoint.pricing.input_cache_read
            .as_ref()
            .and_then(|s| s.parse().ok()),
        cache_creation_input_token_cost: endpoint.pricing.input_cache_write
            .as_ref()
            .and_then(|s| s.parse().ok()),
    })
}

pub async fn fetch_all_mapped() -> HashMap<String, ModelPricing> {
    if let Some(cached) = load_cached() {
        return cached;
    }
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    
    let mut result = HashMap::new();
    
    let unique_ids: std::collections::HashSet<&str> = 
        aliases::OPENROUTER_MAPPINGS.values().copied().collect();
    
    let futures: Vec<_> = unique_ids.iter().map(|id| {
        let client = client.clone();
        let id = id.to_string();
        async move {
            let parts: Vec<&str> = id.split('/').collect();
            if parts.len() == 2 {
                let pricing = fetch_model_endpoints(&client, parts[0], parts[1]).await;
                pricing.map(|p| (id, p))
            } else {
                None
            }
        }
    }).collect();
    
    let results = futures::future::join_all(futures).await;
    
    for res in results.into_iter().flatten() {
        result.insert(res.0, res.1);
    }
    
    if !result.is_empty() {
        let _ = cache::save_cache(CACHE_FILENAME, &result);
    }
    
    result
}

pub async fn fetch_missing(model_ids: &[String]) -> HashMap<String, ModelPricing> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default();
    
    let mut result = HashMap::new();
    
    for model_id in model_ids {
        if let Some(or_id) = aliases::get_openrouter_id(model_id) {
            let parts: Vec<&str> = or_id.split('/').collect();
            if parts.len() == 2 {
                if let Some(pricing) = fetch_model_endpoints(&client, parts[0], parts[1]).await {
                    result.insert(model_id.clone(), pricing);
                }
            }
        }
    }
    
    result
}
