import SwiftUI

/// The three ways to Pro that aren't a purchase (docs/plans/lumni-pro.md):
/// asking for it free, a school's code, and telling a school about Lumni.
/// Reached from the paywall and from Settings.

/// "Can't afford it?" — a sentence or two; an admin decides, and they're
/// emailed either way.
struct FreeAccessSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var status: Request?
    @State private var loaded = false
    @State private var message = ""
    @State private var school = ""
    @State private var busy = false
    @State private var error: String?

    struct Request: Decodable { let status: String; let createdAt: String; let decisionNote: String? }
    private struct Reply: Decodable { let request: Request? }

    var body: some View {
        NavigationStack {
            Page(spacing: 18) {
                TwoTone(lead: "Can't afford Pro?", rest: "Ask for it free.")
                if !loaded {
                    ProgressView().frame(maxWidth: .infinity)
                } else if status?.status == "pending" {
                    InlineNote(text: "Your request is with us. We'll email you when it's decided — usually within a few days.", kind: .ok)
                } else {
                    if status?.status == "declined" {
                        Muted("We couldn't approve your last request." + (status?.decisionNote.map { " \($0)" } ?? "") + " You can ask again if things have changed.", size: 14)
                    }
                    Muted("Lumni is for the families who can't hire a private counselor. If paying is hard right now, tell us a little about it — a sentence or two is plenty. Approved requests get a year of Pro.", size: 15)
                    TextArea(placeholder: "What's going on? (Only the Lumni team reads this.)", text: $message, minLines: 4)
                    RuledField(label: "Your school (optional)", text: $school)
                    if let error { InlineNote(text: error, kind: .problem) }
                    Button { Task { await send() } } label: {
                        if busy { ProgressView().tint(.white) } else { Text("Send request") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || message.trimmingCharacters(in: .whitespacesAndNewlines).count < 10)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .paperChrome()
            .task {
                let r: Reply? = try? await model.api.get("/api/v1/free-access")
                status = r?.request
                loaded = true
            }
        }
    }

    private func send() async {
        struct Body: Encodable { let message: String; let schoolName: String? }
        busy = true
        defer { busy = false }
        do {
            let r: Reply = try await model.api.post("/api/v1/free-access", Body(message: message, schoolName: school.isEmpty ? nil : school))
            status = r.request
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A school's code: Pro until the school's license ends.
struct SchoolCodeSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var joined: String?

    var body: some View {
        NavigationStack {
            Page(spacing: 18) {
                TwoTone(lead: "Your school's code.", rest: "Pro, from your school.")
                if let joined {
                    InlineNote(text: "You're in — \(joined) gives you Lumni Pro.", kind: .ok)
                    Button("Done") { dismiss() }.buttonStyle(PrimaryButtonStyle())
                } else {
                    Muted("If your school or counseling office uses Lumni, they'll have given you a code like LINCOLN-7Q2K.", size: 15)
                    TextField("School code", text: $code)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.system(size: 20, design: .monospaced))
                        .padding(14)
                        .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                    if let error { InlineNote(text: error, kind: .problem) }
                    Button { Task { await redeem() } } label: {
                        if busy { ProgressView().tint(.white) } else { Text("Use code") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || code.trimmingCharacters(in: .whitespaces).count < 4)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .paperChrome()
        }
    }

    private func redeem() async {
        struct Body: Encodable { let code: String }
        struct Reply: Decodable { let orgName: String }
        busy = true
        defer { busy = false }
        do {
            let r: Reply = try await model.api.post("/api/v1/school-code", Body(code: code))
            joined = r.orgName
            error = nil
            try? await model.refresh()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// "Bring Lumni to your school": an inquiry, emailed to the Lumni team.
struct SchoolLeadSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var schoolName = ""
    @State private var contactName = ""
    @State private var role = ""
    @State private var email = ""
    @State private var students = ""
    @State private var message = ""
    @State private var busy = false
    @State private var error: String?
    @State private var sent = false

    var body: some View {
        NavigationStack {
            Page(spacing: 18) {
                TwoTone(lead: "Bring Lumni", rest: "to your school.")
                if sent {
                    InlineNote(text: "Thanks — we'll be in touch soon.", kind: .ok)
                    Button("Done") { dismiss() }.buttonStyle(PrimaryButtonStyle())
                } else {
                    Muted("Schools and counseling offices can give every student Lumni Pro. Tell us who to talk to — or pass this along to your counselor.", size: 15)
                    RuledField(label: "School or organization", text: $schoolName)
                    RuledField(label: "Who should we talk to?", text: $contactName)
                    RuledField(label: "Their role (optional)", text: $role)
                    RuledField(label: "Their email", text: $email, content: .emailAddress, keyboard: .emailAddress)
                    RuledField(label: "About how many students? (optional)", text: $students, keyboard: .numberPad)
                    TextArea(placeholder: "Anything else (optional)", text: $message, minLines: 3)
                    if let error { InlineNote(text: error, kind: .problem) }
                    Button { Task { await send() } } label: {
                        if busy { ProgressView().tint(.white) } else { Text("Send") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || schoolName.isEmpty || contactName.isEmpty || !email.contains("@"))
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Close")
                }
            }
            .paperChrome()
            .onAppear {
                if contactName.isEmpty { contactName = model.viewer?.name ?? "" }
                if email.isEmpty { email = model.viewer?.email ?? "" }
            }
        }
    }

    private func send() async {
        struct Body: Encodable {
            let schoolName: String, contactName: String, role: String?, email: String, students: Int?, message: String?
        }
        struct Ok: Decodable { let ok: Bool }
        busy = true
        defer { busy = false }
        do {
            let _: Ok = try await model.api.post("/api/v1/school-leads", Body(
                schoolName: schoolName, contactName: contactName, role: role.isEmpty ? nil : role, email: email,
                students: Int(students), message: message.isEmpty ? nil : message))
            sent = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
