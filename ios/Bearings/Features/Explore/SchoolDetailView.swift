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
        .task { await load() }
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
        Page(spacing: 32) {
            header(d)
            if let fit = d.fit { whyCard(fit) }
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
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                SchoolLogo(school: s, size: 64)
                VStack(alignment: .leading, spacing: 6) {
                    SectionLabel([
                        "\(s.city), \(s.state)",
                        s.undergradEnrollment.map { "\(Int($0).formatted()) undergrads" },
                    ].compactMap { $0 }.joined(separator: " · "))
                    Text(s.name).font(.system(size: 28, weight: .semibold)).tracking(-0.4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 10) {
                if let tier = d.chance?.tier { TierBadge(tier: tier) }
                if let label = d.fit?.label {
                    Text(label).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.accent)
                }
                Spacer()
                if !model.isParent {
                    if onList {
                        Button("Saved ✓") { model.removeFromList(s.id) }.buttonStyle(OutlineButtonStyle(compact: true))
                            .accessibilityLabel("Remove \(s.name) from your list")
                    } else {
                        Button("Save to list") { model.addToList(s, tier: d.chance?.tier) }.buttonStyle(InkButtonStyle(compact: true))
                    }
                }
            }
        }
    }

    private func whyCard(_ fit: SchoolDetailResponse.Fit) -> some View {
        CardView(tint: .accentSoft, border: .accent.opacity(0.3)) {
            SectionLabel("Why this might be right for you", color: .accent)
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
        return VStack(alignment: .leading, spacing: 16) {
            SectionLabel("Admissions")
            HStack(alignment: .top, spacing: 16) {
                StatView(label: "Acceptance", value: a.acceptanceRate == nil ? "Not reported" : Format.rate(a.acceptanceRate))
                StatView(label: "Testing", value: testPolicy(a.testPolicy))
            }
            StatView(label: "Next deadline", value: d.deadline.map { "\($0.plan) · \(Match.date($0.date)?.formatted(.dateTime.month(.wide).day()) ?? $0.date)" } ?? "See school site")
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
                Muted("For students with your profile, this is a reach — and that's fine. Reaches belong on a list that's built on a solid foundation of targets and likelies.")
            }
        }
    }

    private func cost(_ d: SchoolDetailResponse) -> some View {
        let c = d.school.cost
        let bands: [(String, Double)] = [
            ("Under $48k", c.netPriceByIncome?.under48k), ("$48k – $75k", c.netPriceByIncome?.k48to75),
            ("$75k – $110k", c.netPriceByIncome?.k75to110), ("Over $110k", c.netPriceByIncome?.over110k),
        ].compactMap { label, v in v.map { (label, $0) } }
        let hasCost = c.avgNetPrice != nil || c.stickerPrice != nil || !bands.isEmpty

        return VStack(alignment: .leading, spacing: 16) {
            SectionLabel("Cost — honestly")
            if hasCost {
                StatView(label: "What you'd likely pay", value: d.estimate.map { "~\(Format.dollars($0)) / yr" } ?? "Not reported")
                HStack(alignment: .top, spacing: 16) {
                    StatView(label: "Average net price", value: c.avgNetPrice.map { "\(Format.dollars($0)) / yr" } ?? "Not reported")
                    StatView(label: "Sticker price", value: c.stickerPrice.map { "\(Format.dollars($0)) / yr" } ?? "Not reported")
                }
                if !bands.isEmpty {
                    CardView {
                        SectionLabel("Average net price by family income")
                        VStack(spacing: 0) {
                            ForEach(Array(bands.enumerated()), id: \.offset) { i, band in
                                if i > 0 { Divider().overlay(Color.hairline) }
                                HStack {
                                    Text(band.0).foregroundStyle(Color.grayStrong)
                                    Spacer()
                                    Text("\(Format.dollars(band.1)) / yr").fontWeight(.medium)
                                }
                                .font(.system(size: 15))
                                .padding(.vertical, 9)
                            }
                        }
                        if let met = c.percentNeedMet {
                            Muted("Meets \(Format.rate(met)) of demonstrated need on average\(c.meritAid.map { " · merit aid: \($0)" } ?? ""). \"Need\" is what the aid formulas say your family can't pay — we'll help you check their math.", size: 13)
                        }
                    }
                }
            } else {
                Muted("This school hasn't reported cost figures to the federal data set we use. Its net price calculator — every college is required to publish one — will give you a real number for your family.")
                if let calc = d.school.application?.netPriceCalculatorUrl, let url = URL(string: calc) {
                    Link("Open the net price calculator →", destination: url).font(.system(size: 15)).foregroundStyle(Color.accent)
                }
            }
        }
    }

    @ViewBuilder
    private func academics(_ s: School) -> some View {
        if let a = s.academics {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("Academics")
                // researchOpportunities and coOp show only where known — a
                // schema default printed as a finding would be a lie.
                HStack(alignment: .top, spacing: 16) {
                    if let ratio = a.studentFacultyRatio, !ratio.isEmpty { StatView(label: "Student : faculty", value: ratio) }
                    if let r = a.researchOpportunities { StatView(label: "Research", value: r ? "Real opportunities" : "Limited") }
                    if let co = a.coOp { StatView(label: "Co-op", value: co ? "Structured program" : "Standard") }
                }
                if let majors = a.topMajors, !majors.isEmpty {
                    (Text("Popular majors: ").fontWeight(.medium).foregroundStyle(Color.ink)
                        + Text(majors.joined(separator: " · ")).foregroundStyle(Color.grayStrong))
                        .font(.system(size: 15))
                }
                if let notable = a.notablePrograms, !notable.isEmpty {
                    (Text("Worth knowing: ").fontWeight(.medium).foregroundStyle(Color.ink)
                        + Text(notable.joined(separator: " · ")).foregroundStyle(Color.grayStrong))
                        .font(.system(size: 15))
                }
            }
        }
    }

    @ViewBuilder
    private func life(_ s: School) -> some View {
        if let l = s.life {
            let facts: [(String, String)] = [
                l.greekLifePresence.map { ("Greek life", $0) },
                l.d1Athletics.map { ("D1 athletics", $0 ? "Yes" : "No") },
                l.housingGuaranteed.map { ("Housing guaranteed", "\(Int($0)) year\(Int($0) == 1 ? "" : "s")") },
                l.weather.flatMap { $0.isEmpty ? nil : ("Weather", $0) },
                l.religiousAffiliation.flatMap { $0.isEmpty ? nil : ("Affiliation", $0) },
            ].compactMap { $0 }
            let vibe = l.vibe.flatMap { $0.isEmpty ? nil : $0 }
            let complaints = l.commonComplaints.flatMap { $0.isEmpty ? nil : $0 }
            if vibe != nil || complaints != nil || !facts.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel("Life & culture")
                    if let vibe { Text(vibe + ".").font(.system(size: 17)) }
                    ForEach(facts, id: \.0) { k, v in
                        (Text("\(k): ").foregroundStyle(Color.grayMid) + Text(v).foregroundStyle(Color.ink)).font(.system(size: 15))
                    }
                    if let complaints {
                        (Text("What students complain about: ").fontWeight(.medium).foregroundStyle(Color.ink)
                            + Text("\(complaints). Every school has this list — knowing it beforehand is the difference between a dealbreaker and a shrug.").foregroundStyle(Color.grayStrong))
                            .font(.system(size: 15))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func city(_ s: School) -> some View {
        if let c = s.cityInfo {
            let facts: [(String, String)] = [
                c.costOfLiving.map { ("Cost of living", $0.replacingOccurrences(of: "-", with: " ")) },
                c.transit.map { ("Getting around", $0) },
                c.airportAccess.map { ("Airport access", $0) },
                c.internshipMarket.map { ("Jobs & internships", $0) },
            ].compactMap { $0 }.filter { !$0.1.isEmpty }
            if !facts.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel("The city — you're choosing a place to live, not just a school")
                    ForEach(facts, id: \.0) { k, v in
                        CardView {
                            SectionLabel(k)
                            Text(v).font(.system(size: 15)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let todo = c.thingsToDo, !todo.isEmpty { Muted(todo + ".") }
                }
            }
        }
    }

    @ViewBuilder
    private func outcomes(_ s: School) -> some View {
        if let o = s.outcomes, o.gradRate != nil || o.medianEarnings10yr != nil {
            VStack(alignment: .leading, spacing: 14) {
                SectionLabel("Outcomes")
                HStack(alignment: .top, spacing: 16) {
                    if let g = o.gradRate { StatView(label: "Six-year grad rate", value: Format.rate(g)) }
                    if let e = o.medianEarnings10yr { StatView(label: "Earnings, 10 yrs out", value: Format.dollars(e)) }
                }
                if let n = o.alumniNetwork { StatView(label: "Alumni network", value: n.capitalized) }
            }
        }
    }

    @ViewBuilder
    private func askCounselor(_ s: School) -> some View {
        if !model.isParent {
            CardView {
                Text("Questions about \(s.shortName)? I know your profile — ask me anything about fit, chances, or cost.")
                    .font(.system(size: 16))
                Button("Ask the counselor") {
                    model.askAbout = s
                    model.tab = .counselor
                }
                    .buttonStyle(InkButtonStyle())
            }
        }
    }

    private func testPolicy(_ p: String?) -> String {
        switch p {
        case "blind": "Test-blind"
        case "optional": "Test-optional"
        case "required": "Tests required"
        default: "Not reported"
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
                    Capsule().fill(Color.fill).frame(height: 8)
                    Capsule().fill(Color.hairline)
                        .frame(width: max(4, (pct(high) - pct(low)) * w), height: 8)
                        .offset(x: pct(low) * w)
                    if let value {
                        Circle().fill(Color.accent).overlay(Circle().stroke(Color.paper, lineWidth: 2))
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
