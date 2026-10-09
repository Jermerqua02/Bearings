import SwiftUI

/// The dashboard — app/(app)/dashboard/page.tsx. Different for a student
/// and a parent, and an invitation to onboard when there's no profile yet.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
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
                    .collapsesMainNav()
                    .refreshable { try? await model.refresh() }
                } else {
                    RetryView(message: "Your account didn't load.") { try? await model.refresh() }
                }
            }
            .background(Color.paper)
            .rootScreen("Home")
            #if DEBUG
            .task {
                if model.devSettings { model.devSettings = false; path.append(SettingsRoute()) }
                if model.devYou { model.devYou = false; path.append(SettingsRoute()); path.append(YouRoute()) }
            }
            #endif
            .schoolDestination()
            .navigationDestination(for: SettingsRoute.self) { _ in SettingsView() }
            .navigationDestination(for: YouRoute.self) { _ in YouView() }
            .toolbar {
                // The photo is its own round button; iOS 26 would otherwise
                // set it inside a wider glass capsule.
                if #available(iOS 26.0, *) {
                    ToolbarItem(placement: .topBarLeading) { profileButton }
                        .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .topBarLeading) { profileButton }
                }
            }
        }
    }
}

/// The top of Home: the graduate, large and centered, with the greeting
/// beneath him.
private struct Greeting: View {
    let name: String
    let rest: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GraduateView()
                .frame(height: 230)
                .frame(maxWidth: .infinity)
            SectionLabel(label)
            (Text("Hi \(name). ").foregroundStyle(Color.ink) + Text(rest).foregroundStyle(Color.grayMid))
                .font(.headline1)
                .fixedSize(horizontal: false, vertical: true)
        }
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

        if profile.homeState == nil { HomeStateCard() }

        CheckInCard(checkIns: snapshot.checkIns)

        let deadlines = Match.deadlines(for: snapshot.list, schools: model.school, limit: 3)
        let next = deadlines.first
        TileRow {
            StatTile(label: next.map { "Days until \($0.label)" } ?? "Nothing due yet",
                     value: next.map { "\($0.days)" } ?? "—",
                     tint: (next?.days ?? 99) <= 14 ? .highlight : .surface, icon: "calendar")
            StatTile(label: "Schools on your list", value: "\(snapshot.list.count)", tint: .surface, icon: "building.columns")
        }

        if deadlines.count > 1 {
            Panel(icon: "clock", title: "Coming up") {
                VStack(spacing: 0) {
                    ForEach(Array(deadlines.enumerated()), id: \.element.id) { i, d in
                        if i > 0 { Rectangle().fill(Color.black.opacity(0.06)).frame(height: 1) }
                        DeadlineRow(deadline: d).padding(.vertical, 10)
                    }
                }
            }
        } else if deadlines.isEmpty {
            let early = profile.gradeLevel <= 11 // build or explore mode
            Muted("None on the clock. \(early ? "Exactly right for where you are." : "Check your list's plans.")", size: 14)
        }

        Panel(icon: "chart.pie", title: "List balance", subtitle: "\(counts.reach) reach · \(counts.target) target · \(counts.likely) likely", tint: .mist) {
            BalanceBar(reach: counts.reach, target: counts.target, likely: counts.likely)
            HStack(spacing: 12) {
                ForEach(ChanceTier.allCases, id: \.self) { tier in TierBadge(tier: tier) }
            }
            Button { model.tab = .apply } label: { Label("Open your applications", systemImage: "arrow.up.right") }
                .buttonStyle(OutlineButtonStyle(compact: true))
        }

        Panel(icon: "checklist", title: "Application progress") {
            HStack(spacing: 16) {
                ProgressRing(progress: progress, size: 72, line: 10)
                let inFlight = snapshot.recommenders.filter { $0.status != "submitted" }.count
                Text("Of the mechanical work done."
                     + (inFlight > 0 ? " \(inFlight) rec letter\(inFlight == 1 ? "" : "s") still in flight." : ""))
                    .font(.system(size: 15))
                    .foregroundStyle(Color.grayStrong)
            }
        }

        Panel(icon: "sparkles", title: "From your counselor", tint: .lavender) {
            Text(Match.balanceMessage(reach: counts.reach, target: counts.target, likely: counts.likely))
                .font(.system(size: 17)).fixedSize(horizontal: false, vertical: true)
            Button { model.counselorOpen = true } label: { Label("Talk it through", systemImage: "arrow.up.right") }
                .buttonStyle(InkButtonStyle(compact: true))
        }

        if !snapshot.recentlyViewed.isEmpty {
            Panel(icon: "eye", title: "Recently viewed") {
                VStack(spacing: 10) {
                    ForEach(snapshot.recentlyViewed.prefix(4), id: \.self) { id in
                        if let s = model.school(id) {
                            NavigationLink(value: SchoolRoute(id: id)) {
                                HStack(alignment: .center, spacing: 12) {
                                    SchoolLogo(school: s, size: 36)
                                    Text(s.name).foregroundStyle(Color.ink).lineLimit(1)
                                    Spacer()
                                    if let net = s.cost.avgNetPrice {
                                        Text("~\(Format.thousands(net))").font(.system(size: 13)).foregroundStyle(Color.grayMid)
                                    }
                                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayMid)
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
}

private struct CheckInCard: View {
    @Environment(AppModel.self) private var model
    let checkIns: [WeeklyCheckIn]

    var body: some View {
        if let current = checkIns.first(where: { !$0.dismissed }) {
            Panel(icon: "list.bullet.clipboard", title: "This week", subtitle: "Three things, that's all", tint: .highlightSoft) {
                ForEach(Array(current.actions.enumerated()), id: \.offset) { i, action in
                    Button { model.toggleCheckIn(current.id, action: i) } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: action.done ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .foregroundStyle(action.done ? Color.ink : Color.grayMid)
                            Text(action.text)
                                .strikethrough(action.done)
                                .foregroundStyle(action.done ? Color.grayMid : Color.ink)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(action.done ? .isSelected : [])
                }
                Button("Dismiss for this week") { model.dismissCheckIn(current.id) }
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))
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

        Panel(icon: "sparkles", title: "What's normally happening now", tint: .lavender) {
            Text(Self.seasonContext[mode] ?? "").font(.system(size: 16)).fixedSize(horizontal: false, vertical: true)
        }

        TileRow {
            StatTile(label: "Schools on the list", value: "\(snapshot.list.count)", icon: "building.columns")
            StatTile(label: "Applications submitted", value: "\(submitted)", tint: submitted > 0 ? .highlight : .surface, icon: "paperplane")
        }

        Panel(icon: "lock", title: "What you can see", tint: .mist) {
            Text("You're seeing the shared view: the list, statuses, and deadlines. Your student's counselor conversations and essay drafts stay private unless they choose to share — that boundary is deliberate, and it's part of why this works.")
                .font(.system(size: 14)).foregroundStyle(Color.grayMid)
        }

        Panel(icon: "calendar", title: "Deadlines & money milestones") {
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

extension HomeView {
    var profileButton: some View {
        NavigationLink(value: SettingsRoute()) { AvatarView(size: 38) }
            .buttonStyle(.plain)
            .accessibilityLabel("Your profile and settings")
    }
}

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
