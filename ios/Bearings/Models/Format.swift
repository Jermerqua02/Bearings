import Foundation

/// Ports of the school-figure formatters in lib/format.ts. "Not reported"
/// is written the same way everywhere, and never as zero.
enum Format {
    static let notReported = "—"

    /// "$16k"
    static func thousands(_ dollars: Double?) -> String {
        guard let dollars else { return notReported }
        return "$\(Int((dollars / 1000).rounded()))k"
    }

    /// "$43,120"
    static func dollars(_ dollars: Double?) -> String {
        guard let dollars else { return notReported }
        return "$" + Int(dollars.rounded()).formatted(.number.grouping(.automatic))
    }

    /// "1.2 MB" — formatBytes().
    static func bytes(_ n: Double) -> String {
        if n < 1024 { return "\(Int(n)) B" }
        if n < 1024 * 1024 { return String(format: "%.1f KB", n / 1024) }
        return String(format: "%.1f MB", n / 1024 / 1024)
    }

    /// "Nov 30" from an ISO date.
    static func shortDate(_ iso: String) -> String {
        Match.date(iso)?.formatted(.dateTime.month(.abbreviated).day()) ?? iso
    }

    /// 3.8 → "3.8", 4.47 → "4.47"
    static func gpa(_ v: Double?) -> String {
        guard let v else { return notReported }
        return v.formatted(.number.precision(.fractionLength(0...2)))
    }

    /// "43%"
    static func rate(_ rate: Double?) -> String {
        guard let rate else { return notReported }
        return "\(Int((rate * 100).rounded()))%"
    }
}
