import SwiftUI

/// Account and settings, reached from Home. Styled like the rest of the
/// app rather than as a stock grouped form.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingSignOut = false

    var body: some View {
        Page(spacing: 22) {
            if let viewer = model.viewer {
                TwoTone(lead: viewer.name, rest: viewer.role == .parent ? "· parent" : "")
                CardView {
                    row("Email", viewer.email)
                    Divider().overlay(Color.hairline)
                    row("Account", viewer.role.rawValue.capitalized)
                }
            }

            CardView {
                // Everything not yet native is one tap away on the web,
                // against the same account.
                link("Open Bearings on the web", Config.apiBaseURL)
                Divider().overlay(Color.hairline)
                link("Privacy Policy", Config.apiBaseURL.appending(path: "privacy"))
                Divider().overlay(Color.hairline)
                link("Terms of Service", Config.apiBaseURL.appending(path: "terms"))
            }

            Button("Sign out") { confirmingSignOut = true }
                .buttonStyle(OutlineButtonStyle())
                .confirmationDialog("Sign out of Bearings?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                    Button("Sign out", role: .destructive) { Task { await model.signOut() } }
                }

            Text("Bearings \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(.system(size: 12)).foregroundStyle(Color.grayMid)
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Color.grayStrong)
            Spacer()
            Text(value).foregroundStyle(Color.ink)
        }
        .font(.system(size: 15))
    }

    private func link(_ label: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Text(label).foregroundStyle(Color.ink)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.grayMid)
            }
            .font(.system(size: 15))
        }
    }
}
