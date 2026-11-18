/// Wraps `value` in single quotes so a POSIX shell treats it as one literal word.
/// An embedded single quote becomes `'\''` (close, escaped quote, reopen).
public func shellQuote(_ value: String) -> String {
    "'" + value.replacing("'", with: "'\\''") + "'"
}
