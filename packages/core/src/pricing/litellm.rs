use super::cache;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

const CACHE_FILENAME: &str = "pricing-litellm.json";
const PRICING_URL: &str = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelPricing {
    pub input_cost_per_token: Option<f64>,
    pub output_cost_per_token: Option<f64>,
    pub cache_creation_input_token_cost: Option<f64>,
    pub cache_read_input_token_cost: Option<f64>,
}

pub type PricingDataset = HashMap<String, ModelPricing>;

pub fn load_cached() -> Option<PricingDataset> {
    cache::load_cache(CACHE_FILENAME)
}

pub async fn fetch() -> Result<PricingDataset, reqwest::Error> {
    if let Some(cached) = load_cached() {
        return Ok(cached);
    }
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    
    let data: PricingDataset = client
        .get(PRICING_URL)
        .send()
        .await?
        .json()
        .await?;
    
    let _ = cache::save_cache(CACHE_FILENAME, &data);
    
    Ok(data)
}
