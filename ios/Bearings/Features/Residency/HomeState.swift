import SwiftUI

/// The student's home state — what decides in-state tuition at public
/// schools and which regional exchanges (WUE and the like) they qualify for.
/// Server side: PUT /api/v1/me/home-state, lib/residency.ts.
enum USStates {
    static let all: [(code: String, name: String)] = [
        ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"), ("CA", "California"),
        ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"), ("DC", "District of Columbia"),
        ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"), ("ID", "Idaho"), ("IL", "Illinois"),
        ("IN", "Indiana"), ("IA", "Iowa"), ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"),
        ("ME", "Maine"), ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"),
        ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"), ("NV", "Nevada"),
        ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"), ("NY", "New York"),
        ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"), ("OK", "Oklahoma"), ("OR", "Oregon"),
        ("PA", "Pennsylvania"), ("RI", "Rhode Island"), ("SC", "South Carolina"), ("SD", "South Dakota"),
        ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"),
        ("WA", "Washington"), ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming"),
        ("PR", "Puerto Rico"), ("GU", "Guam"), ("VI", "U.S. Virgin Islands"), ("MP", "Northern Mariana Islands"),
        ("AS", "American Samoa"),
    ]

    static func name(_ code: String?) -> String? {
        code.flatMap { c in all.first { $0.code == c }?.name }
    }
}

/// Pick a state from the list. Saves on tap, then closes.
struct HomeStatePicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var saving: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Public colleges charge less if you live in their state, and some give students from neighboring states a discount too. I'll use this to work out what you'd really pay.")
                        .font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                        .listRowBackground(Color.clear)
                    if let error { InlineNote(text: error, kind: .problem).listRowBackground(Color.clear) }
                }
                ForEach(matches, id: \.code) { state in
                    Button { save(state.code) } label: {
                        HStack {
                            Text(state.name).foregroundStyle(Color.ink)
                            Spacer()
                            if saving == state.code { ProgressView() }
                            else if model.homeState == state.code { Image(systemName: "checkmark").foregroundStyle(Color.accent) }
                        }
                    }
                    .disabled(saving != nil)
                }
            }
            .searchable(text: $query, prompt: "Search states")
            .scrollContentBackground(.hidden)
            .background(Color.paper)
            .navigationTitle("Where do you live?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private var matches: [(code: String, name: String)] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return USStates.all }
        return USStates.all.filter { $0.name.lowercased().contains(q) || $0.code.lowercased() == q }
    }

    private func save(_ code: String) {
        saving = code
        error = nil
        Task {
            defer { saving = nil }
            do {
                try await model.setHomeState(code)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Asks once, on Home, of students whose profile predates the question.
struct HomeStateCard: View {
    @State private var picking = false

    var body: some View {
        Panel(icon: "mappin.and.ellipse", title: "Where do you live?",
              subtitle: "So I can tell you what public colleges really cost you", tint: .lavender) {
            Muted("In-state tuition, out-of-state tuition, and exchanges like WUE that cut it for neighboring states — I can only work these out if I know your state.", size: 14)
            Button { picking = true } label: { Label("Choose your state", systemImage: "arrow.up.right") }
                .buttonStyle(HighlightButtonStyle(compact: true))
        }
        .sheet(isPresented: $picking) {
            HomeStatePicker().presentationBackground(Color.paper)
        }
    }
}

/// "Home state · Washington", changeable — on You, with the rest of what
/// I know about them.
struct HomeStateRow: View {
    @Environment(AppModel.self) private var model
    @State private var picking = false

    var body: some View {
        Button { picking = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "mappin.and.ellipse").font(.system(size: 15)).foregroundStyle(Color.ink)
                    .frame(width: 36, height: 36).background(Color.mist, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Home state").font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                    Text(USStates.name(model.homeState) ?? "Not set — tap to choose")
                        .font(.system(size: 16, weight: .medium)).foregroundStyle(Color.ink)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color.grayMid)
            }
            .padding(14)
            .surfaceCard()
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $picking) {
            HomeStatePicker().presentationBackground(Color.paper)
        }
    }
}

/// At the top of a school's cost section: what where they live does to the
/// price here, and — when an exchange like WUE applies — how to get it.
struct ResidencyPanel: View {
    let residency: SchoolDetailResponse.Residency
    let school: School
    @Environment(AppModel.self) private var model
    @State private var picking = false

    var body: some View {
        switch residency.status {
        case .unknown:
            // A student sets theirs; a parent sets the family's, which stands
            // in for a linked student who hasn't.
            VStack(alignment: .leading, spacing: 10) {
                Muted("\(school.shortName) is public, and these are in-state prices. Tell me where you live and I'll show what you'd actually pay — including any discount for students from nearby states.", size: 14)
                Button { picking = true } label: { Label("Choose your state", systemImage: "mappin.and.ellipse") }
                    .buttonStyle(OutlineButtonStyle(compact: true))
            }
            .sheet(isPresented: $picking) { HomeStatePicker().presentationBackground(Color.paper) }
        case .outOfState:
            Muted("You live in \(residency.homeStateName ?? "another state"), so you'd pay out-of-state tuition here" + (residency.extraPerYear.map { " — about \(Format.thousands($0)) more a year than in-state students, already added to the figures below." } ?? ". The figures below are in-state; out-of-state costs more."), size: 14)
            maybePrograms
        case .exchange:
            if let p = residency.program {
                VStack(alignment: .leading, spacing: 8) {
                    Text(saving.map { "\(p.shortName) could save you about \(Format.thousands($0)) a year" } ?? "\(p.shortName) could lower your tuition here")
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                    Muted("\(school.shortName) takes part in the \(p.name) for students from \(residency.homeStateName ?? "your state"). \(p.terms)", size: 14)
                    Muted(p.howToGet + (p.restrictions.map { " At \(school.shortName): \($0)" } ?? ""), size: 14)
                    if let link = p.url.flatMap(URL.init(string:)) {
                        Link(destination: link) { Label("About \(p.shortName) here", systemImage: "arrow.up.right") }
                            .buttonStyle(OutlineButtonStyle(compact: true))
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
            }
            maybePrograms
        case .inState, .private:
            EmptyView()
        }
    }

    /// Discounts that depend on their major or county — so not in the
    /// estimate, but worth a question to the school.
    @ViewBuilder
    private var maybePrograms: some View {
        ForEach(residency.maybe ?? [], id: \.name) { p in
            VStack(alignment: .leading, spacing: 6) {
                Text("You might also qualify for \(p.shortName)").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color.ink)
                Muted("\(p.terms) It depends on your major or county, so it isn't in the figures below." + (p.restrictions.map { " \($0)" } ?? ""), size: 13)
                if let link = p.url.flatMap(URL.init(string:)) {
                    Link(destination: link) { Label("Check \(p.shortName)", systemImage: "arrow.up.right") }
                        .buttonStyle(LinkButtonStyle(color: .accent))
                }
            }
        }
    }

    /// Out-of-state premium minus what the exchange still adds.
    private var saving: Double? {
        guard let full = residency.outOfStateExtraPerYear, let with = residency.extraPerYear else { return nil }
        return full > with ? full - with : nil
    }
}
