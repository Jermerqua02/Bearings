import SwiftUI

/// The dashboard — app/(app)/dashboard/page.tsx. Different for a student
/// and a parent, and an invitation to onboard when there's no profile yet.
struct HomeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            Group {
                if let snap = model.snapshot {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            switch snap.profile {
                            case .student(let p): StudentHome(profile: p, snapshot: snap)
                            case .parent(let p): ParentHome(profile: p, snapshot: snap)
                            case nil: OnboardingPrompt()
                            }
                        }
                        .padding(20)
                    }
                    .refreshable { try? await model.refresh() }
                } else {
                    RetryView(message: "Your account didn't load.") { try? await model.refresh() }
                }
            }
            .background(Color.paper)
            .navigationTitle("Bearings")
            .navigationBarTitleDisplayMode(.inline)
            .paperChrome()
            .schoolDestination()
            .navigationDestination(for: SettingsRoute.self) { _ in SettingsView() }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: SettingsRoute()) { Image(systemName: "person.crop.circle") }
                        .accessibilityLabel("Account and settings")
                }
            }
        }
    }
}

private struct Greeting: View {
    let name: String
    let rest: String
    let label: String

    var body: some View {
        SectionLabel(label)
        (Text("Hi \(name). ").foregroundStyle(Color.ink) + Text(rest).foregroundStyle(Color.grayMid))
            .font(.headline1)
            .padding(.bottom, 4)
    }
}

// MARK: Student

private struct StudentHome: View {
    @Environment(AppModel.self) private var model
    let profile: StudentProfile
    let snapshot: Snapshot

    private var counts: (reach: Int, target: Int, likely: Int) {
        (snapshot.list.filter { $0.tier == .reach }.count,
         snapshot.list.filter { $0.tier == .target }.count,
         snapshot.list.filter { $0.tier == .likely }.count)
    }

    /// Proportions of the mechanical work, not a grade of the student —
    /// same three checks per school as the web.
    private var progress: Double {
        guard !snapshot.list.isEmpty else { return 0 }
        var done = 0
        for e in snapshot.list {
            if e.plan != nil { done += 1 }
            if snapshot.essays.contains(where: { ($0.schoolId == e.schoolId || $0.schoolId == nil)
                && $0.text.trimmingCharacters(in: .whitespacesAndNewlines).count > 50 }) { done += 1 }
            if e.status.isSubmitted { done += 1 }
        }
        return Double(done) / Double(snapshot.list.count * 3)
    }

    var body: some View {
        Greeting(name: profile.firstName, rest: "Here's where things stand.",
                 label: "\(GradeMode.forGrade(profile.gradeLevel).label) mode")

        CheckInCard(checkIns: snapshot.checkIns)

        CardView {
            SectionLabel("Next deadlines")
            let deadlines = Match.deadlines(for: snapshot.list, schools: model.school, limit: 3)
            if deadlines.isEmpty {
                let early = profile.gradeLevel <= 11 // build or explore mode
                Text("None on the clock. \(early ? "Exactly right for where you are." : "Check your list's plans.")")
                    .foregroundStyle(Color.grayStrong)
            } else {
                ForEach(deadlines) { DeadlineRow(deadline: $0) }
            }
        }

        CardView {
            SectionLabel("List balance")
            BalanceBar(reach: counts.reach, target: counts.target, likely: counts.likely)
            HStack(spacing: 12) {
                ForEach(ChanceTier.allCases, id: \.self) { tier in
                    HStack(spacing: 6) {
                        TierBadge(tier: tier)
                        Text("\(tier == .reach ? counts.reach : tier == .target ? counts.target : counts.likely)")
                            .font(.system(size: 14))
                    }
                }
            }
            Button("Open your applications →") { model.tab = .apply }.buttonStyle(LinkButtonStyle())
        }

        CardView {
            SectionLabel("Application progress")
            HStack(spacing: 16) {
                ZStack {
                    Circle().stroke(Color.fill, lineWidth: 6)
                    Circle().trim(from: 0, to: progress)
                        .stroke(Color.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                .frame(width: 56, height: 56)
                let inFlight = snapshot.recommenders.filter { $0.status != "submitted" }.count
                Text("\(Int((progress * 100).rounded()))% of the mechanical work done."
                     + (inFlight > 0 ? " \(inFlight) rec letter\(inFlight == 1 ? "" : "s") still in flight." : ""))
                    .font(.system(size: 15))
                    .foregroundStyle(Color.grayStrong)
            }
        }

        CardView {
            SectionLabel("From your counselor")
            Text(Match.balanceMessage(reach: counts.reach, target: counts.target, likely: counts.likely))
            Button("Talk it through") { model.tab = .counselor }.buttonStyle(InkButtonStyle(compact: true))
        }

        if !snapshot.recentlyViewed.isEmpty {
            CardView {
                SectionLabel("Recently viewed")
                ForEach(snapshot.recentlyViewed.prefix(4), id: \.self) { id in
                    if let s = model.school(id) {
                        NavigationLink(value: SchoolRoute(id: id)) {
                            HStack(alignment: .center, spacing: 10) {
                                SchoolLogo(school: s, size: 32)
                                Text(s.name).foregroundStyle(Color.ink).lineLimit(1)
                                Spacer()
                                if let net = s.cost.avgNetPrice {
                                    Text("~\(Format.thousands(net)) net")
                                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct CheckInCard: View {
    @Environment(AppModel.self) private var model
    let checkIns: [WeeklyCheckIn]

    var body: some View {
        if let current = checkIns.first(where: { !$0.dismissed }) {
            CardView(tint: .accentSoft, border: .accent.opacity(0.3)) {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel("This week — three things, that's all", color: .accent)
                    Spacer()
                    Button("Dismiss") { model.dismissCheckIn(current.id) }
                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                }
                ForEach(Array(current.actions.enumerated()), id: \.offset) { i, action in
                    Button { model.toggleCheckIn(current.id, action: i) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            RoundedRectangle(cornerRadius: 2)
                                .stroke(action.done ? Color.accent : Color.grayMid, lineWidth: 1)
                                .background(action.done ? Color.accent : .clear, in: RoundedRectangle(cornerRadius: 2))
                                .frame(width: 16, height: 16)
                                .padding(.top, 3)
                            Text(action.text)
                                .strikethrough(action.done)
                                .foregroundStyle(action.done ? Color.grayMid : Color.ink)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(action.done ? .isSelected : [])
                }
            }
        }
    }
}

// MARK: Parent

private struct ParentHome: View {
    @Environment(AppModel.self) private var model
    let profile: ParentProfile
    let snapshot: Snapshot

    private static let seasonContext: [GradeMode: String] = [
        .build: "Right now, nothing is urgent — and that's the truth, not reassurance. These years are about course choices and letting real interests surface. The best thing on the calendar this month is dinner-table curiosity about what your student actually enjoys.",
        .explore: "This is the year of narrowing: testing decisions, early visits, teacher relationships. Most families feel behind right now. Most families are, by internet standards — which are wrong. There is plenty of time.",
        .apply: "Application season. Your student is likely more stressed than they show, and deadlines cluster brutally in October–January. The most useful parental job right now is logistics and meals, not essay edits.",
        .decide: "Decisions arrive and it's emotional whiplash — for everyone. Your job this season: keep costs honest, keep the timeline visible (May 1), and let the student own the final call with you beside them.",
    ]

    var body: some View {
        let mode = GradeMode.forGrade(profile.studentGrade)
        let submitted = snapshot.list.filter { $0.status.isSubmitted }.count

        Greeting(name: profile.firstName, rest: "Here's the honest picture.",
                 label: "\(mode.label) mode · parent view")

        CardView(tint: .accentSoft, border: .accent.opacity(0.3)) {
            SectionLabel("What's normally happening right now", color: .accent)
            Text(Self.seasonContext[mode] ?? "")
        }

        CardView {
            SectionLabel("Progress at a glance")
            Text("\(snapshot.list.count) schools on the list · \(submitted) application\(submitted == 1 ? "" : "s") submitted.")
            Divider().overlay(Color.hairline)
            Text("You're seeing the shared view: the list, statuses, and deadlines. Your student's counselor conversations and essay drafts stay private unless they choose to share — that boundary is deliberate, and it's part of why this works.")
                .font(.system(size: 14)).foregroundStyle(Color.grayMid)
        }

        CardView {
            SectionLabel("Deadlines & money milestones")
            let deadlines = Match.deadlines(for: snapshot.list, schools: model.school, limit: 4)
            if deadlines.isEmpty {
                Text("No application deadlines on the clock.").foregroundStyle(Color.grayStrong)
            } else {
                ForEach(deadlines) { DeadlineRow(deadline: $0) }
            }
            Divider().overlay(Color.hairline)
            Text("FAFSA opens in the fall of senior year — filing early is one of the few pure wins in this process. (FAFSA = the free federal aid form; it drives most need-based aid.)")
                .font(.system(size: 14)).foregroundStyle(Color.grayStrong)
        }
    }
}

struct SettingsRoute: Hashable {}

// MARK: Shared

private struct OnboardingPrompt: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            (Text("Welcome. ").foregroundStyle(Color.ink) + Text("Let's get acquainted.").foregroundStyle(Color.grayMid))
                .font(.headline1)
            Text("Fifteen minutes of honest questions, and everything in here becomes personal to you.")
            // Onboarding isn't native yet; the website's flow writes the same profile.
            Link("Start onboarding on the web", destination: Config.apiBaseURL.appending(path: "onboarding"))
                .foregroundStyle(Color.accent)
        }
    }
}

struct DeadlineRow: View {
    let deadline: Deadline

    var body: some View {
        NavigationLink(value: SchoolRoute(id: deadline.schoolId)) {
            HStack(alignment: .firstTextBaseline) {
                Text(deadline.label).lineLimit(1).foregroundStyle(Color.ink)
                Spacer()
                Text("\(deadline.days)d")
                    .fontWeight(deadline.days <= 14 ? .semibold : .regular)
                    .foregroundStyle(deadline.days <= 14 ? Color.ink : Color.grayMid)
            }
            .font(.system(size: 15))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct BalanceBar: View {
    let reach: Int, target: Int, likely: Int

    var body: some View {
        GeometryReader { geo in
            let total = max(reach + target + likely, 1)
            HStack(spacing: 0) {
                Color.reach.frame(width: geo.size.width * CGFloat(reach) / CGFloat(total))
                Color.target.frame(width: geo.size.width * CGFloat(target) / CGFloat(total))
                Color.likely.frame(width: geo.size.width * CGFloat(likely) / CGFloat(total))
                Spacer(minLength: 0)
            }
            .background(Color.fill)
            .clipShape(Capsule())
        }
        .frame(height: 8)
        .accessibilityElement()
        .accessibilityLabel("\(reach) reach, \(target) target, \(likely) likely")
    }
}
