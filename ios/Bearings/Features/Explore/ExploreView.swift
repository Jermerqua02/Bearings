import SwiftUI
import Observation

/// The explorer's state. Filtering, chances and paging happen on the
/// server; this holds the query and accumulates pages as the student
/// scrolls, which is how a phone reads a long list.
@Observable
final class ExploreStore {
    var query = ExploreQuery()
    private(set) var rows: [ExploreRow] = []
    private(set) var picks: [CounselorPick] = []
    private(set) var options: ExploreOptions?
    private(set) var total = 0
    private(set) var pageCount = 0
    private(set) var needsProfile = false
    private(set) var isParent = false
    /// Free: published facts only (docs/plans/lumni-pro.md).
    private(set) var locked = false
    /// On Free, the whole directory's size — what Pro opens.
    private(set) var fullTotal: Int?
    private(set) var loading = false
    var error: String?

    private var generation = 0

    /// Load page 1 for the current query, replacing what's shown.
    func reload() async {
        generation += 1
        let mine = generation
        query.page = 1
        loading = true
        defer { if mine == generation { loading = false } }
        do {
            let res: ExploreResponse = try await APIClient.shared.get("/api/v1/explore", query: query.items)
            guard mine == generation else { return } // a newer search superseded this one
            apply(res, append: false)
        } catch {
            if mine == generation { self.error = error.localizedDescription }
        }
    }

    func loadMore() async {
        guard !loading, query.page < pageCount else { return }
        loading = true
        defer { loading = false }
        var next = query
        next.page += 1
        do {
            let res: ExploreResponse = try await APIClient.shared.get("/api/v1/explore", query: next.items)
            query.page = next.page
            apply(res, append: true)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func apply(_ res: ExploreResponse, append: Bool) {
        options = res.options
        needsProfile = res.needsProfile
        isParent = res.isParent ?? false
        locked = res.locked ?? false
        fullTotal = res.fullTotal
        // "Best fit" is Pro; the server sorts A–Z instead, and so says the picker.
        if locked, query.sort == "fit" { query.sort = "name" }
        total = res.total ?? 0
        pageCount = res.pageCount ?? 0
        rows = append ? rows + (res.rows ?? []) : (res.rows ?? [])
        if !append { picks = res.picks ?? [] }
    }
}

struct ExploreView: View {
    @Environment(AppModel.self) private var model
    @State private var store = ExploreStore()
    @State private var filtersOpen = false
    @State private var searchText = ""
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if store.needsProfile {
                    needsProfile
                } else {
                    results
                }
            }
            .rootScreen("Explore", hidesBar: true)
            .schoolDestination()
            .sheet(isPresented: $filtersOpen) {
                if let options = store.options {
                    FilterSheet(options: options, query: Binding(get: { store.query }, set: { store.query = $0 })) {
                        filtersOpen = false
                        Task { await store.reload() }
                    }
                    .presentationDetents([.large])
                    .presentationBackground(Color.paper)
                }
            }
        }
        .task {
            #if DEBUG
            if let id = model.devSchool { model.devSchool = nil; path.append(SchoolRoute(id: id)) }
            #endif
            if store.options == nil { await store.reload() }
        }
        .task(id: searchText) {
            // Wait for a pause in typing — one request per keystroke over
            // ~1,900 schools is waste, the same debounce as the web.
            guard searchText != store.query.q else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            store.query.q = searchText
            await store.reload()
        }
    }

    private var results: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                TwoTone(lead: "\(store.total.formatted()) school\(store.total == 1 ? "" : "s")", rest: "worth your attention.")
                    .padding(.bottom, 20)

                if store.locked { FreeDirectoryNote(shown: store.total, all: store.fullTotal).padding(.bottom, 16) }

                toolbar.padding(.bottom, 16)

                if store.query.filterCount == 0 && store.query.q.isEmpty {
                    if store.locked {
                        LockedCard(icon: "sparkles", title: "Counselor picks",
                                   teaser: "Schools within reach for you, at your price — and why each one fits.")
                            .padding(.bottom, 28)
                    } else if !store.picks.isEmpty {
                        picks.padding(.bottom, 28)
                    }
                }

                if store.total > store.rows.count && !store.rows.isEmpty {
                    Text("Showing \(store.rows.count) of \(store.total.formatted()) — search by name to jump to one")
                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                        .padding(.bottom, 12)
                }

                if store.rows.isEmpty && !store.loading && store.options != nil {
                    emptyState
                }
                // Rows sit directly in the LazyVStack so each is built only
                // when it scrolls into view. Wrapped in a plain VStack they
                // were all built at once, the last row's onAppear fired
                // immediately, and the explorer paged through 500 schools
                // on launch.
                ForEach(store.rows) { row in
                    ResultCard(row: row)
                        .padding(.bottom, 12)
                        .opacity(store.loading && store.query.page == 1 ? 0.5 : 1)
                        .onAppear {
                            if row.id == store.rows.last?.id { Task { await store.loadMore() } }
                        }
                }

                if store.loading {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.interactively)
        .collapsesMainNav()
        .refreshable { await store.reload() }
    }

    private var toolbar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.grayMid)
                TextField("Search by name or city", text: $searchText)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                if !searchText.isEmpty {
                    Button { searchText = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Color.grayMid) }
                        .accessibilityLabel("Clear search")
                }
            }
            .font(.system(size: 16))
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.surface, in: Capsule())
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)

            HStack(spacing: 8) {
                Button {
                    filtersOpen = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "line.3.horizontal.decrease")
                        Text(store.query.filterCount > 0 ? "Filters · \(store.query.filterCount)" : "Filters")
                    }
                }
                .buttonStyle(OutlineButtonStyle(compact: true))

                if let sorts = store.options?.sorts {
                    SelectBox(options: sorts.map { ($0.id, $0.label) },
                              selection: Binding(get: { store.query.sort },
                                                 set: { store.query.sort = $0; Task { await store.reload() } }),
                              compact: true)
                }
            }
        }
    }

    private var picks: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(icon: "sparkles", title: "Counselor picks", subtitle: "Within reach, at your price", iconBackground: .lavender)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(Array(store.picks.enumerated()), id: \.element.id) { i, pick in
                        NavigationLink(value: SchoolRoute(id: pick.school.id)) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(String(format: "%02d", i + 1)).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayMid)
                                Text(pick.school.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                                    .multilineTextAlignment(.leading)
                                Text(pick.reason).font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                                    .multilineTextAlignment(.leading).lineLimit(4)
                                Spacer(minLength: 0)
                            }
                            .padding(16)
                            .frame(width: 250, height: 140, alignment: .topLeading)
                            .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                            .softShadow()
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .scrollClipDisabled()
        }
    }

    private var emptyState: some View {
        CardView {
            Text("No schools match all of those at once.").font(.system(size: 17, weight: .medium))
            Muted(store.query.filterCount > 0
                  ? "That combination is narrower than the data supports. Loosening the price cap or adding a second region usually opens it back up."
                  : "Nothing matches that search. Try part of the name, or the city.")
            if store.query.filterCount > 0 || !store.query.q.isEmpty {
                Button("Clear all filters") {
                    store.query.clearFilters()
                    searchText = ""
                    Task { await store.reload() }
                }
                .buttonStyle(InkButtonStyle(compact: true))
            }
        }
    }

    private var needsProfile: some View {
        Page {
            if store.isParent {
                TwoTone(lead: "The explorer works", rest: "from your student's profile.")
                Muted("Chances, fit and net price are all calculated against a specific student's grades, budget and preferences — so this page waits until yours has finished onboarding. Their list, deadlines and aid comparisons are already on your Home tab.")
            } else {
                TwoTone(lead: "Set up your profile", rest: "and this gets personal.")
                Muted("It takes about ten minutes, and everything here — chances, fit, what you'd actually pay — becomes specific to you.")
                Link("Start onboarding on the web →", destination: Config.apiBaseURL.appending(path: "onboarding"))
                    .font(.system(size: 16, weight: .medium)).foregroundStyle(Color.accent)
            }
        }
    }
}

/// A result: logo, name, the three numbers that matter, chance and fit,
/// and a one-tap save.
private struct ResultCard: View {
    @Environment(AppModel.self) private var model
    let row: ExploreRow

    var body: some View {
        let s = row.school
        let saved = model.isOnList(s.id)
        HStack(alignment: .top, spacing: 12) {
            NavigationLink(value: SchoolRoute(id: s.id)) {
                HStack(alignment: .top, spacing: 12) {
                    SchoolLogo(school: s)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(s.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
                            .multilineTextAlignment(.leading)
                        Text([
                            "\(s.city), \(s.state)",
                            (row.netForYou ?? s.cost.avgNetPrice).map { "~\(Format.thousands($0)) net" },
                            s.admissions.acceptanceRate.map { "\(Format.rate($0)) admit" },
                        ].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                        if row.tier != nil || !(row.fitLabel ?? "").isEmpty {
                            HStack(spacing: 8) {
                                if let tier = row.tier { TierBadge(tier: tier) }
                                if let fit = row.fitLabel, !fit.isEmpty {
                                    Text(fit).font(.system(size: 13, weight: .medium)).foregroundStyle(Color.accent)
                                }
                            }
                            .padding(.top, 2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("explore.result")

            if !model.isParent {
                Button { model.toggleList(s, tier: row.tier) } label: {
                    Image(systemName: saved ? "checkmark" : "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(saved ? Color.white : Color.ink)
                        .frame(width: 34, height: 34)
                        .background(saved ? Color.ink : Color.surface, in: Circle())
                        .overlay(Circle().stroke(saved ? Color.ink : Color.hairline))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(saved ? "Remove \(s.name) from your list" : "Add \(s.name) to your list")
            }
        }
        .padding(14)
        .surfaceCard()
    }
}

/// Every filter the web's rail has, as chip groups in a sheet.
private struct FilterSheet: View {
    let options: ExploreOptions
    @Binding var query: ExploreQuery
    let done: () -> Void

    var body: some View {
        NavigationStack {
            Page(spacing: 26) {
                group("Your chances", options.tiers, \.tiers,
                      note: "Estimated from your grades and scores against each school's range.")
                group("Region", options.regions, \.regions)
                group("Size", options.sizes, \.sizes)
                group("Setting", options.settings, \.settings)
                group("Type", options.types, \.types)
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Cost after aid")
                    FlowLayout {
                        ForEach(options.costCaps) { c in
                            Chip(label: c.label, active: query.costCap == c.id) { query.costCap = c.id }
                        }
                    }
                    Muted("Net price = what families actually pay, on average. Always our default.", size: 13)
                }
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Testing")
                    Chip(label: "Test-optional or blind only", active: query.testOptionalOnly) { query.testOptionalOnly.toggle() }
                }
                if query.filterCount > 0 {
                    Button("Clear all filters") { query.clearFilters() }.buttonStyle(LinkButtonStyle())
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .paperChrome()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Show schools", action: done).fontWeight(.semibold)
                }
            }
        }
    }

    private func group(_ title: String, _ items: [FilterOption], _ path: WritableKeyPath<ExploreQuery, Set<String>>,
                       note: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
            FlowLayout {
                ForEach(items) { item in
                    Chip(label: item.label, active: query[keyPath: path].contains(item.id)) {
                        if query[keyPath: path].contains(item.id) { query[keyPath: path].remove(item.id) } else { query[keyPath: path].insert(item.id) }
                    }
                }
            }
            if let note { Muted(note, size: 13) }
        }
    }
}


/// On Free, atop Explore: what this list is, what it isn't, and what Pro
/// opens — so a short directory reads as a choice, not a bug.
private struct FreeDirectoryNote: View {
    @Environment(AppModel.self) private var model
    let shown: Int
    let all: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Lumni Free").font(.system(size: 16, weight: .semibold)).foregroundStyle(Color.ink)
            VStack(alignment: .leading, spacing: 8) {
                bullet("checkmark", "\(shown) well-known schools, with their published numbers")
                bullet("checkmark", "Save up to 5 to your list")
                bullet("lock.fill", "\(all.map { "All \($0.formatted()) schools" } ?? "Every school"), your chances and real cost at each, and picks chosen for you — with Pro")
            }
            Button { model.showPaywall() } label: { Text("Upgrade to Pro") }
                .buttonStyle(InkButtonStyle(compact: true))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
        .softShadow()
    }

    private func bullet(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                .foregroundStyle(icon == "lock.fill" ? Color.accent : Color.ink)
            Text(text).font(.system(size: 14)).foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
