import SwiftUI

/// The college list — app/(app)/list/page.tsx, starting with the parts
/// that matter on a phone: what's on it, its balance, and each school's
/// plan and status. A parent sees it read-only, as on the web.
struct SchoolListView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            Group {
                if let snap = model.snapshot {
                    if snap.list.isEmpty {
                        ContentUnavailableView("Nothing here yet",
                                               systemImage: "list.bullet",
                                               description: Text("Schools you save while exploring land here."))
                    } else {
                        List {
                            Section {
                                let c = ChanceTier.allCases.map { t in snap.list.filter { $0.tier == t }.count }
                                VStack(alignment: .leading, spacing: 10) {
                                    BalanceBar(reach: c[0], target: c[1], likely: c[2])
                                    Text(Match.balanceMessage(reach: c[0], target: c[1], likely: c[2]))
                                        .font(.system(size: 15)).foregroundStyle(Color.grayStrong)
                                }
                                .padding(.vertical, 6)
                            }
                            ForEach(ChanceTier.allCases, id: \.self) { tier in
                                let entries = snap.list.filter { $0.tier == tier }
                                if !entries.isEmpty {
                                    Section {
                                        ForEach(entries) { entry in
                                            NavigationLink(value: entry.schoolId) { ListRow(entry: entry) }
                                                .deleteDisabled(model.isParent)
                                        }
                                        .onDelete { offsets in
                                            for i in offsets { model.removeFromList(entries[i].schoolId) }
                                        }
                                    } header: {
                                        Text("\(tier.label) · \(entries.count)")
                                    }
                                }
                            }
                        }
                        .refreshable { try? await model.refresh() }
                    }
                } else {
                    RetryView(message: "Your list didn't load.") { try? await model.refresh() }
                }
            }
            .navigationTitle("Your list")
            .navigationDestination(for: String.self) { ListEntryDetail(schoolId: $0) }
        }
    }
}

private struct ListRow: View {
    @Environment(AppModel.self) private var model
    let entry: ListEntry

    var body: some View {
        let school = model.school(entry.schoolId)
        VStack(alignment: .leading, spacing: 4) {
            Text(school?.name ?? entry.schoolId).font(.system(size: 16, weight: .medium))
            HStack(spacing: 6) {
                if let school { Text("\(school.city), \(school.state)") }
                Text("·")
                Text(entry.plan?.label ?? "No plan")
                Text("·")
                Text(entry.outcome?.label ?? entry.status.label)
            }
            .font(.system(size: 13))
            .foregroundStyle(Color.grayStrong)
            .lineLimit(1)
        }
        .padding(.vertical, 2)
    }
}

private struct ListEntryDetail: View {
    @Environment(AppModel.self) private var model
    let schoolId: String

    var body: some View {
        if let entry = model.snapshot?.list.first(where: { $0.schoolId == schoolId }) {
            let school = model.school(schoolId)
            Form {
                if let school {
                    Section {
                        LabeledContent("Acceptance rate", value: Format.rate(school.admissions.acceptanceRate))
                        LabeledContent("Average net price", value: Format.thousands(school.cost.avgNetPrice))
                        if let d = Match.nextDeadline(school, plan: entry.plan) {
                            LabeledContent("Next deadline",
                                           value: "\(d.plan) · \(d.date.formatted(.dateTime.month(.abbreviated).day()))")
                        }
                    }
                }

                Section("Your application") {
                    Picker("Tier", selection: binding(entry, \.tier)) {
                        ForEach(ChanceTier.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    // The API can set a field but not clear it yet, so "none"
                    // is only offered while it's still the truth.
                    Picker("Plan", selection: binding(entry, \.plan)) {
                        if entry.plan == nil { Text("Not chosen").tag(ApplicationPlan?.none) }
                        ForEach(school?.admissions.plansOffered ?? ApplicationPlan.allCases, id: \.self) {
                            Text($0.label).tag(Optional($0))
                        }
                    }
                    Picker("Status", selection: binding(entry, \.status)) {
                        ForEach(ListEntry.Status.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    if entry.status == .decision {
                        Picker("Outcome", selection: binding(entry, \.outcome)) {
                            if entry.outcome == nil { Text("Not yet").tag(ListEntry.Outcome?.none) }
                            ForEach(ListEntry.Outcome.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
                        }
                    }
                }
                .disabled(model.isParent)
            }
            .navigationTitle(school?.shortName ?? "School")
            .navigationBarTitleDisplayMode(.inline)
        } else {
            ContentUnavailableView("Not on your list", systemImage: "questionmark")
        }
    }

    /// Picker bindings write through the model, which saves optimistically.
    private func binding<V>(_ entry: ListEntry, _ path: WritableKeyPath<ListEntry, V>) -> Binding<V> {
        Binding(get: { entry[keyPath: path] },
                set: { value in model.updateEntry(schoolId) { $0[keyPath: path] = value } })
    }
}
