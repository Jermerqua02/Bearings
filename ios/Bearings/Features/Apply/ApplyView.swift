import SwiftUI

/// Apply — the tracker from app/(app)/apply/page.tsx. Every school on the
/// list, where each application stands, what the school asks for, and the
/// button that takes the student to the real form. Replaces the plain list:
/// it's the same schools with everything a student needs to act on them.
struct ApplyView: View {
    @Environment(AppModel.self) private var model
    @State private var cards: [String: ApplicationCard] = [:]
    @State private var loadError: String?
    @State private var path = NavigationPath()
    /// A linked parent has two lists: their student's, and their own.
    @State private var whose: Whose = .student

    enum Whose: Hashable { case student, mine }

    /// The web's pipeline. "applying" is a legacy status that reads as
    /// "Not started", as it does there.
    static let pipeline: [(ListEntry.Status, String)] = [
        (.considering, "Not started"),
        (.inProgress, "In progress"),
        (.submitted, "Submitted"),
        (.materialsReceived, "Materials received"),
        (.decision, "Decision"),
    ]

    var body: some View {
        NavigationStack(path: $path) {
            Page(spacing: 20) {
                if model.isParent { parentLists } else { studentList }
            }
            .rootScreen("Apply", hidesBar: true)
            .schoolDestination()
            .refreshable { try? await model.refresh(); await load() }
        }
        .tabRoot(.apply, path: $path)
        // Reload when the list changes shape — a school saved in Explore
        // needs its requirements fetched.
        // Again when the plan changes: the requirements are Pro.
        .task(id: "\(model.snapshot?.list.map(\.schoolId).joined(separator: ",") ?? "")-\(model.isPro)") { await load() }
    }

    /// A parent: their student's applications (read-only, as before) and,
    /// apart from them, the list they keep themselves.
    @ViewBuilder
    private var parentLists: some View {
        let linked = model.snapshot?.parentLinked ?? false
        let name = model.linkedStudentName
        TwoTone(lead: linked && whose == .student ? "Where things stand," : "Your list,",
                rest: linked && whose == .student ? "one school at a time." : "schools you're looking at.")
        UpgradeBanner()
        if linked {
            SegmentTabs(tabs: [(.student, name.map { "\($0)'s list" } ?? "Their list"), (.mine, "My list")], selection: $whose)
        }
        if linked && whose == .student {
            studentApplications
        } else {
            OwnList(linked: linked)
        }
    }

    @ViewBuilder
    private var studentList: some View {
        TwoTone(lead: "Your applications,", rest: "one school at a time.")
        UpgradeBanner()
        studentApplications
    }

    @ViewBuilder
    private var studentApplications: some View {
                let list = model.snapshot?.list ?? []
                if list.isEmpty {
                    CardView {
                        Text("Nothing here yet.").font(.system(size: 17, weight: .medium))
                        Muted("Save a school from Explore and it appears here, with what it asks for and where to apply.")
                        if !model.isParent {
                            Button("Explore schools") { model.tab = .explore }.buttonStyle(InkButtonStyle(compact: true))
                        }
                    }
                } else {
                    DueSoon(list: list)
                    if let loadError { InlineNote(text: loadError, kind: .problem) }
                    ForEach(list) { entry in
                        if let school = model.school(entry.schoolId) {
                            ApplicationCardView(entry: entry, school: school, card: cards[entry.schoolId])
                        }
                    }
                }
    }

    private func load() async {
        do {
            let res: ApplicationsResponse = try await model.api.get("/api/v1/applications")
            cards = Dictionary(uniqueKeysWithValues: res.cards.map { ($0.schoolId, $0) })
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}

/// A parent's own list: schools they've saved while exploring, kept apart
/// from their student's. Not a tracker — parents don't apply — just the
/// schools, what they cost and admit, and a way to take one off.
private struct OwnList: View {
    @Environment(AppModel.self) private var model
    let linked: Bool

    var body: some View {
        let list = model.myList
        if list.isEmpty {
            CardView {
                Text("Nothing saved yet.").font(.system(size: 17, weight: .medium))
                Muted(linked
                      ? "Schools you save from Explore land here — yours, not on your student's list. Bring the good ones up with them."
                      : "Schools you save from Explore land here. Link with your student in Settings to see their list too.")
                Button("Explore schools") { model.tab = .explore }.buttonStyle(InkButtonStyle(compact: true))
            }
        } else {
            VStack(spacing: 12) {
                ForEach(list) { entry in
                    if let school = model.school(entry.schoolId) {
                        HStack(alignment: .center, spacing: 12) {
                            NavigationLink(value: SchoolRoute(id: school.id)) {
                                HStack(spacing: 12) {
                                    SchoolLogo(school: school)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(school.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                                            .multilineTextAlignment(.leading)
                                        Text([
                                            "\(school.city), \(school.state)",
                                            school.cost.avgNetPrice.map { "~\(Format.thousands($0)) net" },
                                            school.admissions.acceptanceRate.map { "\(Format.rate($0)) admit" },
                                        ].compactMap { $0 }.joined(separator: " · "))
                                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Button { model.removeFromList(school.id) } label: {
                                Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayStrong)
                                    .frame(width: 30, height: 30).background(Color.mist, in: Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove \(school.name) from your list")
                        }
                        .padding(14)
                        .surfaceCard()
                        .accessibilityIdentifier("ownlist.row")
                    }
                }
            }
        }
    }
}

/// "Due in the next 14 days", above the cards.
private struct DueSoon: View {
    @Environment(AppModel.self) private var model
    let list: [ListEntry]

    var body: some View {
        let soon = Match.deadlines(for: list, schools: model.school, limit: 10).filter { $0.days <= 14 }
        if !soon.isEmpty {
            Panel(icon: "clock.badge.exclamationmark", title: "Due in the next 14 days", tint: .highlightSoft) {
                ForEach(soon) { DeadlineRow(deadline: $0) }
            }
        }
    }
}

private struct ApplicationCardView: View {
    @Environment(AppModel.self) private var model
    let entry: ListEntry
    let school: School
    let card: ApplicationCard?
    @State private var choosingRound = false

    private var stage: Int {
        let status = entry.status == .applying ? .inProgress : entry.status
        return ApplyView.pipeline.firstIndex { $0.0 == status } ?? 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            planRow
            if let plan = entry.plan, plan == .ED || plan == .ED2,
               let why = card?.plans.first(where: { $0.id == plan })?.why {
                // Binding plans get their consequence spelled out on the card.
                Label(why, systemImage: "exclamationmark.triangle")
                    .font(.system(size: 13)).foregroundStyle(Color.ink)
                    .padding(12)
                    .background(Color.highlightSoft, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            }

            // Where it stands — its own strip, so status never blends into requirements.
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Status").font(.system(size: 14, weight: .semibold))
                    Spacer()
                    SelectBox(options: ApplyView.pipeline.map { ($0.0, $0.1) },
                              selection: Binding(get: { entry.status == .applying ? .considering : entry.status },
                                                 set: { s in model.updateEntry(entry.schoolId) { $0.status = s } }),
                              compact: true)
                        .fixedSize()
                        .disabled(model.isParent)
                }
                PipelineBar(stage: stage, count: ApplyView.pipeline.count)
                if entry.status == .decision { outcomeRow }
            }
            .padding(14)
            .background(Color.mist, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))

            if !model.isPro {
                // The full tracker — what each school asks for, fees, where
                // to file — is Pro. The status and deadline above stay free.
                ProRow(text: "Everything \(school.shortName) asks for, the fee, and where to file")
            } else if let card {
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(icon: "doc.text", title: "What they ask for", iconBackground: .mist)
                    requirements(card)
                }
                fee(card.fee)
                if !card.routes.isEmpty { routes(card.routes) }
                if let note = card.attribution { Text(note).font(.system(size: 12)).foregroundStyle(Color.grayMid) }
            } else {
                ProgressView().frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(18)
        .surfaceCard(radius: Radius.panel)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            NavigationLink(value: SchoolRoute(id: school.id)) {
                HStack(alignment: .top, spacing: 12) {
                    SchoolLogo(school: school, size: 40)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(school.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(Color.ink)
                            .multilineTextAlignment(.leading)
                        HStack(spacing: 8) {
                            TierBadge(tier: entry.tier)
                            if let d = Match.nextDeadline(school, plan: entry.plan) {
                                let days = Match.daysUntil(d.date)
                                Text(days >= 0 ? "\(d.plan) · \(days)d" : "\(d.plan) · passed")
                                    .font(.system(size: 13, weight: days <= 14 && days >= 0 ? .semibold : .regular))
                                    .foregroundStyle(days <= 14 && days >= 0 ? Color.ink : Color.grayMid)
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 0)
            if !model.isParent {
                Menu {
                    Picker("Chance", selection: Binding(get: { entry.tier },
                                                        set: { t in model.updateEntry(entry.schoolId) { $0.tier = t } })) {
                        ForEach(ChanceTier.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    Button("Remove from list", role: .destructive) { model.removeFromList(entry.schoolId) }
                } label: {
                    Image(systemName: "ellipsis").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.grayStrong)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel("More for \(school.shortName)")
            }
        }
    }

    /// The round, asked only where choosing changes the deadline — the
    /// web's PlanRow.
    @ViewBuilder
    private var planRow: some View {
        let label = entry.plan.flatMap { p in card?.plans.first { $0.id == p }?.label } ?? entry.plan?.label
        switch card?.prompt {
        case .choose(let dated, let others):
            HStack(spacing: 8) {
                Text("Applying:").font(.system(size: 14)).foregroundStyle(Color.grayMid)
                roundSelect(dated + others)
            }
        case .single(let plan, let due):
            VStack(alignment: .leading, spacing: 6) {
                Text(label ?? "\(card?.plans.first { $0.id == plan }?.label ?? plan.label) · due \(due)")
                    .font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                changeRound
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                if let label {
                    Text(label).font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                } else {
                    Text("Deadline not published here — check \(school.shortName)'s admissions page.")
                        .font(.system(size: 14)).foregroundStyle(Color.grayMid)
                }
                changeRound
            }
        }
    }

    @ViewBuilder
    private var changeRound: some View {
        if model.isParent {
            EmptyView()
        } else if choosingRound {
            roundSelect(ApplicationPlan.allCases)
        } else {
            Button(entry.plan == nil ? "Record which round you're applying" : "Change round") { choosingRound = true }
                .buttonStyle(LinkButtonStyle(color: .grayMid))
        }
    }

    private func roundSelect(_ plans: [ApplicationPlan]) -> some View {
        let options: [(ApplicationPlan?, String)] = (entry.plan == nil ? [(nil, "How you'll apply…")] : [])
            + plans.map { p in
                let choice = card?.plans.first { $0.id == p }
                guard let choice else { return (p, p.label) }
                return (p, choice.due.map { "\(choice.label) — due \($0)" } ?? choice.label)
            }
        return SelectBox(options: options.map { ($0.0, $0.1) },
                         selection: Binding(get: { entry.plan },
                                            set: { p in if let p { model.updateEntry(entry.schoolId) { $0.plan = p } } }),
                         compact: true)
            .disabled(model.isParent)
    }

    private var outcomeRow: some View {
        HStack(spacing: 10) {
            Text("Outcome").font(.system(size: 14, weight: .semibold))
            Spacer()
            let options: [(ListEntry.Outcome?, String)] = (entry.outcome == nil ? [(nil, "—")] : [])
                + ListEntry.Outcome.allCases.map { ($0, $0.label) }
            SelectBox(options: options.map { ($0.0, $0.1) },
                      selection: Binding(get: { entry.outcome },
                                         set: { o in if let o { model.updateEntry(entry.schoolId) { $0.outcome = o } } }),
                      compact: true)
                .fixedSize()
                .disabled(model.isParent)
        }
    }

    @ViewBuilder
    private func requirements(_ card: ApplicationCard) -> some View {
        if card.requirements.isEmpty {
            Muted(card.emptyReason == "open-admission"
                  ? "Open admission — this school accepts applicants who meet its basic requirements."
                  : "We don't have this school's requirements yet. Check their admissions page.", size: 14)
        } else {
            VStack(alignment: .leading, spacing: 7) {
                ForEach(card.requirements) { line in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: line.mandatory ? (line.done == true ? "checkmark.circle.fill" : "circle") : "minus")
                            .font(.system(size: 12))
                            .foregroundStyle(line.done == true ? Color.accent : (line.mandatory ? Color.ink : Color.grayMid))
                            .frame(width: 14)
                        (Text(line.label).fontWeight(.medium).foregroundStyle(line.done == true ? Color.grayMid : Color.ink)
                            + Text(" — \(line.status)\(line.detail.map { " (\($0))" } ?? "")")
                                .foregroundStyle(line.mandatory && line.done != true ? Color.grayStrong : Color.grayMid))
                            .font(.system(size: 14))
                    }
                }
            }
        }
    }

    private func fee(_ fee: ApplicationCard.Fee) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "creditcard").font(.system(size: 13, weight: .medium))
                .frame(width: 30, height: 30).background(Color.mist, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(fee.known ? fee.text : "Fee not published here")
                    .font(.system(size: 16, weight: .semibold))
                Text(fee.known ? "Application fee" : "Check the school's page")
                    .font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                if let asOf = fee.asOf {
                    Text("Federal data, \(asOf)\(fee.mayHaveDropped == true ? " — many colleges have dropped their fee since; worth checking" : "")")
                        .font(.system(size: 12)).foregroundStyle(Color.grayMid)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func routes(_ routes: [ApplicationCard.ApplyRoute]) -> some View {
        FlowLayout(spacing: 8) {
            ForEach(routes) { r in
                if let url = URL(string: r.href) {
                    Link(destination: url) { Text("\(r.label) →") }
                        .buttonStyle(r.shared ? AnyButtonStyle(HighlightButtonStyle(compact: true)) : AnyButtonStyle(OutlineButtonStyle(compact: true)))
                }
            }
        }
    }
}

/// Lets one call site pick between two button styles.
struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
