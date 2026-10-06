import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            Form {
                if let viewer = model.viewer {
                    Section("Account") {
                        LabeledContent("Name", value: viewer.name)
                        LabeledContent("Email", value: viewer.email)
                        LabeledContent("Role", value: viewer.role.rawValue.capitalized)
                    }
                }
                Section {
                    // Everything not yet native is one tap away on the web,
                    // against the same account.
                    Link("Open Bearings on the web", destination: Config.apiBaseURL)
                    Link("Privacy Policy", destination: Config.apiBaseURL.appending(path: "privacy"))
                    Link("Terms of Service", destination: Config.apiBaseURL.appending(path: "terms"))
                }
                Section {
                    Button("Sign out", role: .destructive) { Task { await model.signOut() } }
                }
                Section {
                } footer: {
                    Text("Bearings \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") · \(Config.apiBaseURL.host() ?? "")")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
