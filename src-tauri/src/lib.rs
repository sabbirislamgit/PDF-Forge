#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_pdf_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if let Ok(out) = Command::new("reg")
            .args(&["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut fonts = Vec::new();
            for line in text.lines() {
                let trimmed = line.trim();
                if let Some(idx) = trimmed.find("REG_SZ") {
                    let font_name = trimmed[..idx].trim();
                    let cleaned = font_name
                        .replace(" (TrueType)", "")
                        .replace(" (OpenType)", "")
                        .replace(" (All parts)", "")
                        .trim()
                        .to_string();
                    if !cleaned.is_empty() && !fonts.contains(&cleaned) {
                        fonts.push(cleaned);
                    }
                }
            }
            fonts.sort();
            return Ok(fonts);
        }
    }
    Ok(Vec::new())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_pdf_file,
            write_pdf_file,
            get_system_fonts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
