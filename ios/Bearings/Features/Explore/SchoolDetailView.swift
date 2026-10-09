import SwiftUI

/// School detail — app/(app)/explore/[id]/SchoolDetail.tsx. Editorial and
/// profile-specific: "why this might be right for you" leads, net price is
/// the headline number, and the city is its own section. Every fact shows
/// when it's known and is simply absent when it isn't.
struct SchoolDetailView: View {
    @Environment(AppModel.self) private var model
    let schoolId: String
    @State private var detail: SchoolDetailResponse?
    @State private var why: String?
    @State private var failed: String?

    var body: some View {
        Group {
            if let detail {
                content(detail)
            } else if let failed {
                RetryView(message: failed) { await load() }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.paper)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
        // Again when the home state changes: the prices depend on it.
        .task(id: model.homeStateRevision) { await load() }
    }

    private func load() async {
        failed = nil
        do {
            detail = try await model.api.get("/api/v1/schools/\(AppModel.escape(schoolId))")
            try? await model.api.perform("POST", "/api/v1/schools/\(AppModel.escape(schoolId))/viewed")
            if detail?.fit != nil {
                struct Why: Decodable { let text: String }
                let w: Why? = try? await model.api.get("/api/v1/schools/\(AppModel.escape(schoolId))/why")
                why = w?.text.isEmpty == false ? w?.text : nil
                if why == nil { why = "" }
            }
        } catch {
            failed = error.localizedDescription
        }
    }

    @ViewBuilder
    private func content(_ d: SchoolDetailResponse) -> some View {
        let s = d.school
        Page(spacing: 18) {
            header(d)
            glance(d)
            if let fit = d.fit { whyPanel(fit) }
            admissions(d)
            cost(d)
            academics(s)
            life(s)
            city(s)
            outcomes(s)
            askCounselor(s)
        }
        .navigationTitle(s.shortName)
    }

    // MARK: Sections

    private func header(_ d: SchoolDetailResponse) -> some View {
        let s = d.school
        let onList = model.isOnList(s.id)
        return VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 14) {
                SchoolLogo(school: s, size: 60)
                VStack(alignment: .leading, spacing: 4) {
                    Text([
                        "\(s.city), \(s.state)",
                        s.undergradEnrollment.map { "\(Int($0).formatted()) undergrads" },
                    ].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                    HStack(spacing: 8) {
                        if let tier = d.chance?.tier { TierBadge(tier: tier) }
                        if let label = d.fit?.label {
                            Text(label).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.accent)
                        }
                    }
                }
            }
            Text(s.name).font(.display(30)).tracking(-0.3)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("school.name")
            if !model.isParent {
                if onList {
                    Button { model.removeFromList(s.id) } label: { Label("On your list", systemImage: "checkmark") }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .accessibilityLabel("Remove \(s.name) from your list")
                } else {
                    Button { model.addToList(s, tier: d.chance?.tier) } label: { Label("Save to list", systemImage: "plus") }
                        .buttonStyle(HighlightButtonStyle(compact: true))
                }
            }
        }
    }

    /// The four numbers a student asks first, before any section.
    private func glance(_ d: SchoolDetailResponse) -> some View {
        let a = d.school.admissions
        return VStack(spacing: 10) {
            TileRow {
                StatTile(label: "What you'd likely pay / yr", value: d.estimate.map { Format.thousands($0) } ?? "—",
                         note: residencyNote(d.residency), tint: .highlight, icon: "dollarsign")
                StatTile(label: "Acceptance rate", value: a.acceptanceRate == nil ? "—" : Format.rate(a.acceptanceRate),
                         tint: .surface, icon: "checkmark.seal")
            }
            TileRow {
                deadlineTile(d)
                StatTile(label: "Testing", value: testPolicy(a.testPolicy), tint: .surface, icon: "pencil.and.list.clipboard")
            }
        }
    }

    /// Whose price the estimate is: theirs as an in-state, out-of-state or
    /// exchange student — or, not knowing their state, an in-stater's.
    private func residencyNote(_ r: SchoolDetailResponse.Residency?) -> String? {
        switch r?.status {
        case .inState: "In-state for you"
        // Without tuition figures nothing was added: say the price is in-state.
        case .outOfState: r?.extraPerYear == nil ? "In-state price — you'd pay more" : "Out-of-state tuition included"
        case .exchange:
            r?.program.map { r?.extraPerYear == nil ? "In-state price — \($0.shortName) may apply" : "With \($0.shortName)" }
        case .unknown: "If you're in-state"
        default: nil
        }
    }

    /// The next date to file by. When we hold none, say so plainly and
    /// send them to the school — "—" read as "there isn't one".
    @ViewBuilder
    private func deadlineTile(_ d: SchoolDetailResponse) -> some View {
        if let next = d.deadline, let date = Match.date(next.date) {
            StatTile(label: "Next deadline · \(next.plan)",
                     value: date.formatted(.dateTime.month(.abbreviated).day()),
                     tint: .surface, icon: "calendar")
        } else {
            // Dates on file but none ahead: this cycle's have passed.
            let passed = !d.school.admissions.deadlines.isEmpty
            let tile = StatTile(label: passed ? "Deadlines this year" : "Deadline",
                                value: passed ? "Passed" : "Not listed",
                                note: d.school.application?.url == nil ? nil : "Check \(d.school.shortName)'s site ↗",
                                tint: .surface, icon: "calendar")
            if let link = d.school.application?.url.flatMap(URL.init(string:)) {
                Link(destination: link) { tile }.buttonStyle(.plain)
            } else {
                tile
            }
        }
    }

    private func whyPanel(_ fit: SchoolDetailResponse.Fit) -> some View {
        Panel(icon: "sparkles", title: "How it fits you", subtitle: "From your counselor", tint: .lavender) {
            if let why, !why.isEmpty {
                Text(why).font(.system(size: 17)).fixedSize(horizontal: false, vertical: true)
            } else if why == nil {
                HStack(spacing: 8) { ProgressView(); Muted("Reading your profile…") }
            }
            if !fit.reasons.isEmpty {
                FlowLayout { ForEach(fit.reasons, id: \.self) { Pill(text: $0) } }
            }
        }
    }

    private func admissions(_ d: SchoolDetailResponse) -> some View {
        let a = d.school.admissions
        let hasRanges = (a.gpaMid50?.count == 2) || (a.satMid50?.count == 2)
        return Panel(icon: "chart.bar.xaxis", title: "Admissions", subtitle: hasRanges ? "You against the middle 50%" : nil, tint: .surface) {
            // A range plots only where the school published one — a missing
            // range drawn against the student's real number would be invented.
            if let g = a.gpaMid50, g.count == 2 {
                RangePlot(label: "GPA (unweighted)", low: g[0], high: g[1], value: d.you?.gpaUnweighted, domain: 2.5...4.0)
            }
            if let sat = a.satMid50, sat.count == 2 {
                RangePlot(label: "SAT", low: sat[0], high: sat[1], value: d.you?.sat, domain: 800...1600)
            }
            if let caveat = d.chance?.caveat { Muted(caveat, size: 14) }
            if d.chance?.tier == .reach {
                Muted("For students with your profile, this is a reach — and that's fine. Reaches belong on a list that's built on a solid foundation of targets and likelies.", size: 14)
            }
            if !hasRanges && d.chance?.caveat == nil && d.chance?.tier != .reach {
                Muted("This school hasn't published grade or test ranges.", size: 14)
            }
        }
    }

    private func cost(_ d: SchoolDetailResponse) -> some View {
        let c = d.school.cost
        let r = d.residency
        let isPublic = r != nil && r?.status != .private
        // The published figures are in-state. Out of state, every one of them
        // carries what residency adds, so the numbers are this student's —
        // not in-state ones with a "plus $19k" to do in their head.
        let extra: Double? = (r?.status == .outOfState || r?.status == .exchange) ? r?.extraPerYear : nil
        // Rounded once the extra is added: "$9,240" claims a precision two
        // averages added together don't have.
        let yours = { (v: Double?) in v.map { extra == nil ? $0 : (($0 + extra!) / 100).rounded() * 100 } }
        let whose = extra == nil ? (isPublic ? ", in-state" : "")
            : r?.status == .exchange ? ", for you with \(r?.program?.shortName ?? "the exchange")" : ", for you (out-of-state)"
        let bands: [(String, String)] = [
            ("Under $48k", c.netPriceByIncome?.under48k), ("$48k – $75k", c.netPriceByIncome?.k48to75),
            ("$75k – $110k", c.netPriceByIncome?.k75to110), ("Over $110k", c.netPriceByIncome?.over110k),
        ].compactMap { label, v in yours(v).map { (label, "\(Format.dollars($0)) / yr") } }
        let hasCost = c.avgNetPrice != nil || c.stickerPrice != nil || !bands.isEmpty

        return Panel(icon: "dollarsign.circle", title: "Cost — honestly", subtitle: "Net price, not sticker, is the real number") {
            if let r { ResidencyPanel(residency: r, school: d.school) }
            if hasCost {
                TileRow {
                    StatTile(label: "Average net price\(whose)",
                             value: yours(c.avgNetPrice).map { Format.thousands($0) } ?? "—", tint: .mist, elevated: false)
                    StatTile(label: "Sticker price\(extra == nil ? "" : whose)",
                             value: yours(c.stickerPrice).map { Format.thousands($0) } ?? "—", tint: .mist, elevated: false)
                }
                if !bands.isEmpty {
                    Text("By family income\(whose)").font(.system(size: 14, weight: .semibold)).padding(.top, 4)
                    FactRows(rows: bands)
                    if let note = flatAidNote(d.school) { Muted(note, size: 13) }
                }
                if let met = c.percentNeedMet {
                    Muted("Meets \(Format.rate(met)) of demonstrated need on average\(c.meritAid.map { " · merit aid: \($0)" } ?? ""). \"Need\" is what the aid formulas say your family can't pay — we'll help you check their math.", size: 13)
                }
            } else {
                Muted("This school hasn't reported cost figures to the federal data set we use. Its net price calculator — every college is required to publish one — will give you a real number for your family.")
            }
            if let calc = d.school.application?.netPriceCalculatorUrl, let url = URL(string: calc) {
                Link(destination: url) { Label("Net price calculator", systemImage: "arrow.up.right") }
                    .buttonStyle(OutlineButtonStyle(compact: true))
            }
        }
    }

    /// When lower-income families pay nearly what higher-income ones do. It
    /// reads like a mistake and isn't: the federal figures say the school
    /// gives little need-based aid, which is worth knowing early.
    private func flatAidNote(_ s: School) -> String? {
        guard let low = s.cost.netPriceByIncome?.under48k, let high = s.cost.netPriceByIncome?.over110k,
              high > 0, low >= high * 0.8 else { return nil }
        return "Families under $48k pay nearly as much here as families over $110k. That's what \(s.shortName) reports to the Department of Education, not a mistake — it gives little need-based aid. Run its net price calculator, and look hard at outside scholarships before counting on it."
    }

    @ViewBuilder
    private func academics(_ s: School) -> some View {
        if let a = s.academics {
            let tiles: [(String, String)] = [
                a.studentFacultyRatio.flatMap { $0.isEmpty ? nil : ("Student : faculty", $0) },
                // Shown only where known — a schema default printed as a
                // finding would be a lie.
                a.researchOpportunities.map { ("Research access", $0 ? "Yes" : "Limited") },
                a.coOp.map { ("Co-op program", $0 ? "Yes" : "No") },
            ].compactMap { $0 }
            let majors = a.topMajors ?? []
            let notable = a.notablePrograms ?? []
            if !tiles.isEmpty || !majors.isEmpty || !notable.isEmpty {
                Panel(icon: "books.vertical", title: "Academics", tint: .surface) {
                    if !tiles.isEmpty {
                        TileRow { ForEach(tiles, id: \.0) { StatTile(label: $0.0, value: $0.1, tint: .mist, elevated: false) } }
                    }
                    if !majors.isEmpty {
                        Text("Popular majors").font(.system(size: 14, weight: .semibold))
                        FlowLayout { ForEach(majors, id: \.self) { Pill(text: $0, fill: .mist) } }
                    }
                    if !notable.isEmpty {
                        Text("Worth knowing").font(.system(size: 14, weight: .semibold))
                        Muted(notable.joined(separator: " · "), size: 14)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func life(_ s: School) -> some View {
        if let l = s.life {
            let facts: [(String, String)] = [
                l.greekLifePresence.map { ("Greek life", $0.capitalized) },
                l.d1Athletics.map { ("D1 athletics", $0 ? "Yes" : "No") },
                l.housingGuaranteed.map { ("Housing guaranteed", "\(Int($0)) year\(Int($0) == 1 ? "" : "s")") },
                l.weather.flatMap { $0.isEmpty ? nil : ("Weather", $0) },
                l.religiousAffiliation.flatMap { $0.isEmpty ? nil : ("Affiliation", $0) },
            ].compactMap { $0 }
            let vibe = l.vibe.flatMap { $0.isEmpty ? nil : $0 }
            let complaints = l.commonComplaints.flatMap { $0.isEmpty ? nil : $0 }
            if vibe != nil || complaints != nil || !facts.isEmpty {
                Panel(icon: "person.3", title: "Life & culture") {
                    if let vibe { Text(vibe + ".").font(.system(size: 17)).fixedSize(horizontal: false, vertical: true) }
                    if !facts.isEmpty { FactRows(rows: facts) }
                    if let complaints {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("What students complain about").font(.system(size: 14, weight: .semibold))
                            Muted("\(complaints). Every school has this list — knowing it beforehand is the difference between a dealbreaker and a shrug.", size: 14)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.highlightSoft, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func city(_ s: School) -> some View {
        if let c = s.cityInfo {
            let facts: [(String, String, String)] = [
                c.costOfLiving.map { ("dollarsign", "Cost of living", $0.replacingOccurrences(of: "-", with: " ").capitalized) },
                c.transit.map { ("tram", "Getting around", $0) },
                c.airportAccess.map { ("airplane", "Airport access", $0) },
                c.internshipMarket.map { ("briefcase", "Jobs & internships", $0) },
            ].compactMap { $0 }.filter { !$0.2.isEmpty }
            if !facts.isEmpty {
                Panel(icon: "building.2", title: "The city", subtitle: "You're choosing a place to live, not just a school", tint: .surface) {
                    VStack(spacing: 10) {
                        ForEach(facts, id: \.1) { icon, label, value in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: icon).font(.system(size: 13, weight: .medium))
                                    .frame(width: 30, height: 30).background(Color.mist, in: Circle())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(label).font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                                    Text(value).font(.system(size: 15)).fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.mist, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
                        }
                    }
                    if let todo = c.thingsToDo, !todo.isEmpty { Muted(todo + ".", size: 14) }
                }
            }
        }
    }

    @ViewBuilder
    private func outcomes(_ s: School) -> some View {
        if let o = s.outcomes, o.gradRate != nil || o.gradRate4yr != nil || o.medianEarnings10yr != nil {
            Panel(icon: "graduationcap", title: "Outcomes") {
                TileRow {
                    // Four years is what a family plans and pays for; the
                    // six-year figure is the federal headline, so it stays
                    // alongside — the gap between them is worth seeing.
                    if let g4 = o.gradRate4yr {
                        StatTile(label: "Graduate in four years", value: Format.rate(g4),
                                 note: o.gradRate.map { "\(Format.rate($0)) within six" }, tint: .mist, elevated: false)
                    } else if let g = o.gradRate {
                        StatTile(label: "Graduate within six years", value: Format.rate(g), tint: .mist, elevated: false)
                    }
                    // Scorecard measures ten years after starting college —
                    // about six after graduating.
                    if let e = o.medianEarnings10yr { StatTile(label: "Median earnings after college", value: Format.thousands(e), tint: .mist, elevated: false) }
                }
                if let n = o.alumniNetwork { FactRows(rows: [("Alumni network", n.capitalized)]) }
            }
        }
    }

    @ViewBuilder
    private func askCounselor(_ s: School) -> some View {
        if !model.isParent {
            Panel(icon: "bubble.left.and.text.bubble.right", title: "Questions about \(s.shortName)?", tint: .lavender) {
                Muted("I know your profile — ask me anything about fit, chances, or cost.")
                Button {
                    model.askAbout = s
                    model.counselorOpen = true
                } label: { Label("Ask the counselor", systemImage: "arrow.up.right") }
                    .buttonStyle(InkButtonStyle(compact: true))
            }
        }
    }

    private func testPolicy(_ p: String?) -> String {
        switch p {
        case "blind": "Blind"
        case "optional": "Optional"
        case "required": "Required"
        default: "—"
        }
    }
}

/// The student's number against a school's middle 50%.
struct RangePlot: View {
    let label: String
    let low: Double
    let high: Double
    let value: Double?
    let domain: ClosedRange<Double>

    private func pct(_ v: Double) -> CGFloat {
        CGFloat(min(1, max(0, (v - domain.lowerBound) / (domain.upperBound - domain.lowerBound))))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(label)
                Spacer()
                Text("mid-50%: \(Format.gpa(low))–\(Format.gpa(high))\(value.map { " · you: \(Format.gpa($0))" } ?? "")")
                    .font(.system(size: 13)).foregroundStyle(Color.grayMid)
            }
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.mist).frame(height: 8)
                    Capsule().fill(Color.mistStrong)
                        .frame(width: max(4, (pct(high) - pct(low)) * w), height: 8)
                        .offset(x: pct(low) * w)
                    if let value {
                        Circle().fill(Color.accent).overlay(Circle().stroke(Color.surface, lineWidth: 2))
                            .frame(width: 16, height: 16)
                            .offset(x: pct(value) * w - 8)
                    }
                }
            }
            .frame(height: 16)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): middle half of admitted students \(Format.gpa(low)) to \(Format.gpa(high))\(value.map { ", yours \(Format.gpa($0))" } ?? "")")
    }
}
