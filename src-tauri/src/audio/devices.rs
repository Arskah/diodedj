use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub name: String,
    pub description: String,
    pub is_default: bool,
}

pub fn list_output_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let Ok(devices) = host.output_devices() else {
        return vec![];
    };

    devices
        .filter_map(|d| {
            let name = d.name().ok()?;
            let is_default = !default_name.is_empty() && name == default_name;
            Some(DeviceInfo {
                description: name.clone(),
                name,
                is_default,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_devices_does_not_panic() {
        // host.output_devices() may fail or return zero devices in CI sandboxes;
        // success criterion is "no panic, returns Vec".
        let _ = list_output_devices();
    }
}
