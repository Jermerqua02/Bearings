import SwiftUI
import StoreKit

/// Settings › Link an account. A student links one parent, a parent one
/// student, and Pro is shared between them — so a purchase by either covers
/// both. It's deliberate on both ends: one makes a code and sends it, the
/// other enters it (lib/link-codes.ts).
struct LinkAccountSection: View {
    @Environment(AppModel.self) private var model
    @State private var state: LinkState?
    @State private var entering = ""
    @State private var busy = false
    @State private var error: String?
    @State private var confirmingUnlink = false

    struct LinkState: Decodable {
        let linked: Person?
        let code: Code?
    }
    struct Person: Decodable { let name: String; let email: String; let role: String }
    struct Code: Decodable { let code: String; let expiresAt: String }

    private var other: String { model.isParent ? "student" : "parent" }

    var body: some View {
        CardView {
            SectionLabel("Link an account")
            if let linked = state?.linked {
                linkedView(linked)
            } else if state != nil {
                unlinkedView
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
            if let error { InlineNote(text: error, kind: .problem) }
        }
        .task { await load() }
        .confirmationDialog("Unlink your accounts?", isPresented: $confirmingUnlink, titleVisibility: .visible) {
            Button("Unlink", role: .destructive) { Task { await unlink() } }
        } message: {
            Text("They'll no longer see your list, and Pro stops being shared.")
        }
    }

    private func linkedView(_ p: Person) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "person.2.fill").font(.system(size: 15))
                    .frame(width: 40, height: 40).background(Color.lavender, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name.isEmpty ? p.email : p.name).font(.system(size: 16, weight: .semibold))
                    Text("Your \(p.role) · \(p.email)").font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                }
            }
            Muted(model.isPro ? "Pro is shared between you." : "When either of you has Pro, you both do.", size: 14)
            Button("Unlink") { confirmingUnlink = true }
                .buttonStyle(LinkButtonStyle(color: .grayStrong))
        }
    }

    private var unlinkedView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Muted("Link your \(other) so you share Lumni — and Pro: when either of you has it, you both do. One link each.", size: 14)

            if let code = state?.code {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Your code").font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                    Text(code.code).font(.system(size: 30, weight: .semibold, design: .monospaced)).tracking(2)
                        .textSelection(.enabled)
                    Text("Works once, for 7 days. They enter it in Settings › Link an account.")
                        .font(.system(size: 13)).foregroundStyle(Color.grayMid)
                    ShareLink(item: shareText(code.code)) {
                        Label("Send it to your \(other)", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(InkButtonStyle(compact: true))
                }
            } else {
                Button { Task { await makeCode() } } label: {
                    Label("Make a link code", systemImage: "link")
                }
                .buttonStyle(InkButtonStyle(compact: true))
                .disabled(busy)
            }

            Divider().overlay(Color.hairline)

            VStack(alignment: .leading, spacing: 8) {
                Text("Have a code from your \(other)?").font(.system(size: 14, weight: .medium))
                HStack(spacing: 10) {
                    TextField("e.g. 7Q2-K9M", text: $entering)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(size: 17, design: .monospaced))
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Color.mist, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                    Button("Link") { Task { await redeem() } }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        .disabled(busy || entering.trimmingCharacters(in: .whitespaces).count < 6)
                }
            }
        }
    }

    private func shareText(_ code: String) -> String {
        "Link with me on Lumni: open the app, go to Settings › Link an account, and enter \(code). It works for 7 days."
    }

    // MARK: Calls

    private func load() async {
        do {
            state = try await model.api.get("/api/v1/links")
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func makeCode() async {
        busy = true
        defer { busy = false }
        do {
            let code: Code = try await model.api.post("/api/v1/links/code")
            state = LinkState(linked: nil, code: code)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func redeem() async {
        struct Body: Encodable { let code: String }
        struct Linked: Decodable { let linked: Person }
        busy = true
        defer { busy = false }
        do {
            let res: Linked = try await model.api.post("/api/v1/links/redeem", Body(code: entering))
            state = LinkState(linked: res.linked, code: nil)
            entering = ""
            error = nil
            // Pro may have just arrived with them.
            try? await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func unlink() async {
        busy = true
        defer { busy = false }
        do {
            try await model.api.perform("DELETE", "/api/v1/links")
            state = LinkState(linked: nil, code: nil)
            error = nil
            try? await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Settings' plan row: Free or Pro, and for Free, the way to see Pro. An
/// App Store subscription is managed — and cancelled — in Apple's own sheet.
struct PlanRow: View {
    @Environment(AppModel.self) private var model
    @State private var managing = false

    var body: some View {
        row
        if model.viewer?.plan?.source == "app_store", model.viewer?.plan?.via == "own" {
            Divider().overlay(Color.hairline)
            Button("Manage subscription") { managing = true }
                .font(.system(size: 15)).foregroundStyle(Color.accent)
                .manageSubscriptionsSheet(isPresented: $managing)
        }
    }

    private var row: some View {
        HStack {
            Text("Plan").foregroundStyle(Color.grayStrong)
            Spacer()
            if model.isPro {
                HStack(spacing: 6) {
                    ProBadge()
                    if let label = detail { Text(label).font(.system(size: 13)).foregroundStyle(Color.grayStrong) }
                }
            } else {
                Button("Free · See Pro") { model.showPaywall() }
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(Color.accent)
            }
        }
        .font(.system(size: 15))
    }

    private var detail: String? {
        guard let plan = model.viewer?.plan else { return nil }
        if plan.via == "family" { return "shared" }
        if let ends = plan.endsAt.flatMap(Match.date) {
            return "until \(ends.formatted(.dateTime.month(.abbreviated).day().year()))"
        }
        return nil
    }
}


/// Settings: the ways to Pro that aren't a purchase, and the way to tell a
/// school about Lumni — which anyone can use.
struct ProWaysSection: View {
    @Environment(AppModel.self) private var model
    @State private var asking = false
    @State private var schoolCode = false
    @State private var lead = false

    var body: some View {
        CardView {
            if !model.isPro && !model.proRemoved {
                row("I have a school code", "ticket") { schoolCode = true }
                Divider().overlay(Color.hairline)
                row("Request free access", "heart") { asking = true }
                Divider().overlay(Color.hairline)
            }
            row("Bring Lumni to your school", "building.columns") { lead = true }
        }
        .sheet(isPresented: $asking) { FreeAccessSheet().presentationBackground(Color.paper) }
        .sheet(isPresented: $schoolCode) { SchoolCodeSheet().presentationBackground(Color.paper) }
        .sheet(isPresented: $lead) { SchoolLeadSheet().presentationBackground(Color.paper) }
    }

    private func row(_ title: String, _ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Label(title, systemImage: icon).foregroundStyle(Color.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayMid)
            }
            .font(.system(size: 15))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
