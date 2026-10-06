import Foundation

/// Ports of the school-figure formatters in lib/format.ts. "Not reported"
/// is written the same way everywhere, and never as zero.
enum Format {
    static let notReported = "—"

    /// "$16k"
    static func thousands(_ dollars: Int?) -> String {
        guard let dollars else { return notReported }
        return "$\(Int((Double(dollars) / 1000).rounded()))k"
    }

    /// "43%"
    static func rate(_ rate: Double?) -> String {
        guard let rate else { return notReported }
        return "\(Int((rate * 100).rounded()))%"
    }
}
