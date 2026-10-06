import Foundation

/*
  Ports of the pieces of lib/match.ts the app needs. Keep the wording
  identical to the TS — the counselor's voice shouldn't change with the
  device.
*/

struct Deadline: Identifiable {
    var id: String { "\(schoolId)-\(plan)" }
    let schoolId: String
    let label: String
    let plan: String
    let date: Date
    var days: Int { Match.daysUntil(date) }
}

enum Match {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()

    static func date(_ s: String) -> Date? {
        iso.date(from: String(s.prefix(10)))
    }

    /// nextDeadline(): the preferred plan's date if it has one, otherwise
    /// the soonest upcoming deadline.
    static func nextDeadline(_ school: School, plan: ApplicationPlan?, from: Date = .now) -> (plan: String, date: Date)? {
        let entries = school.admissions.deadlines.compactMap { k, v in date(v).map { (plan: k, date: $0) } }
        if let plan, let hit = entries.first(where: { $0.plan == plan.rawValue }) {
            return hit
        }
        return entries.filter { $0.date >= from }.min { $0.date < $1.date }
    }

    static func daysUntil(_ date: Date, from: Date = .now) -> Int {
        Int((date.timeIntervalSince(from) / 86_400).rounded(.up))
    }

    /// The upcoming deadlines across a list, soonest first.
    static func deadlines(for list: [ListEntry], schools: (String) -> School?, limit: Int) -> [Deadline] {
        list.compactMap { e -> Deadline? in
            guard let s = schools(e.schoolId), let d = nextDeadline(s, plan: e.plan) else { return nil }
            let out = Deadline(schoolId: s.id, label: "\(s.shortName) · \(d.plan)", plan: d.plan, date: d.date)
            return out.days >= 0 ? out : nil
        }
        .sorted { $0.date < $1.date }
        .prefix(limit)
        .map { $0 }
    }

    static func balanceMessage(reach: Int, target: Int, likely: Int) -> String {
        let total = reach + target + likely
        if total == 0 { return "Nothing here yet — let's start exploring." }
        if likely == 0 {
            return "\(reach) reach\(reach == 1 ? "" : "es"), \(target) target\(target == 1 ? "" : "s"), no likelies — every strong list needs a foundation. Let's find likely schools you'd genuinely be excited about."
        }
        if reach > likely + target {
            return "\(reach) reaches against \(target + likely) others — that's top-heavy. Ambition is good; balance is what protects it."
        }
        if total < 4 { return "A good start. Most balanced lists end up with 7–10 schools." }
        return "This is a healthy shape — a real foundation with room to dream."
    }
}
