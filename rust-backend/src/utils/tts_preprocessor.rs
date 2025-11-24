/// Filter text for TTS processing
pub fn tts_filter(
    text: &str,
    remove_special_char: bool,
    ignore_brackets: bool,
    ignore_parentheses: bool,
    ignore_asterisks: bool,
    ignore_angle_brackets: bool,
) -> String {
    let mut result = text.to_string();

    if ignore_asterisks {
        result = filter_pattern(&result, '*', '*');
    }

    if ignore_brackets {
        result = filter_pattern(&result, '[', ']');
    }

    if ignore_parentheses {
        result = filter_pattern(&result, '(', ')');
    }

    if ignore_angle_brackets {
        result = filter_pattern(&result, '<', '>');
    }

    if remove_special_char {
        result = result
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace() || ".,!?;:".contains(*c))
            .collect();
    }

    result
}

fn filter_pattern(text: &str, start: char, end: char) -> String {
    let mut result = String::new();
    let mut in_pattern = false;
    let mut depth = 0;

    for ch in text.chars() {
        if ch == start {
            depth += 1;
            in_pattern = true;
        } else if ch == end && in_pattern {
            depth -= 1;
            if depth == 0 {
                in_pattern = false;
            }
        } else if !in_pattern {
            result.push(ch);
        }
    }

    result
}

