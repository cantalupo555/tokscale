pub mod aliases;
pub mod cache;
pub mod litellm;
pub mod lookup;
pub mod openrouter;

use lookup::{PricingLookup, LookupResult};
use std::collections::HashMap;

pub use litellm::ModelPricing;

pub struct PricingService {
    lookup: PricingLookup,
}

impl PricingService {
    pub fn new(litellm_data: HashMap<String, ModelPricing>, openrouter_data: HashMap<String, ModelPricing>) -> Self {
        Self {
            lookup: PricingLookup::new(litellm_data, openrouter_data),
        }
    }
    
    pub async fn fetch() -> Result<Self, String> {
        let (litellm_result, openrouter_data) = tokio::join!(
            litellm::fetch(),
            openrouter::fetch_all_mapped()
        );
        
        let litellm_data = litellm_result.map_err(|e| e.to_string())?;
        
        Ok(Self::new(litellm_data, openrouter_data))
    }
    
    pub fn lookup(&self, model_id: &str) -> Option<LookupResult> {
        self.lookup.lookup(model_id)
    }
    
    pub fn calculate_cost(&self, model_id: &str, input: i64, output: i64, cache_read: i64, cache_write: i64, reasoning: i64) -> f64 {
        self.lookup.calculate_cost(model_id, input, output, cache_read, cache_write, reasoning)
    }
}
