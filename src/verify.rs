fn main() {
    if let Some(request) = std::env::args().nth(1) {
        println!(
            "{}",
            box_studio_engine::calculate(
                &serde_json::from_str::<serde_json::Value>(&request).unwrap()
            )
        );
    } else {
        let mut e = box_studio_engine::Engine::new();
        println!("{}", serde_json::to_string_pretty(&e.verify()).unwrap());
    }
}
