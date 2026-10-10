import SwiftUI
import PhotosUI

/// Account and settings, reached from Home. Styled like the rest of the
/// app rather than as a stock grouped form.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingSignOut = false
    @State private var photo: PhotosPickerItem?
    @State private var savingPhoto = false

    var body: some View {
        Page(spacing: 22) {
            if let viewer = model.viewer {
                // The photo, large, with the controls to change it.
                VStack(spacing: 14) {
                    AvatarView(size: 112)
                        .overlay { if savingPhoto { ProgressView().tint(.white) } }
                    let pickerTitle = model.avatar == nil ? "Add a photo" : "Change photo"
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $photo, matching: .images) {
                            Label(pickerTitle, systemImage: "camera")
                        }
                        .buttonStyle(OutlineButtonStyle(compact: true))
                        if model.avatar != nil {
                            Button("Remove") { Task { await model.removeAvatar() } }
                                .buttonStyle(LinkButtonStyle(color: .grayStrong))
                        }
                    }
                    .disabled(savingPhoto)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .onChange(of: photo) { _, item in
                    guard let item else { return }
                    photo = nil
                    savingPhoto = true
                    Task {
                        defer { savingPhoto = false }
                        if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                            await model.setAvatar(image)
                        }
                    }
                }

                TwoTone(lead: viewer.name, rest: viewer.role == .parent ? "· parent" : "")

                // Everyone has a You: a student's record, or a parent's own notes.
                NavigationLink(value: YouRoute()) {
                    HStack(spacing: 14) {
                        Image(systemName: "person.text.rectangle").font(.system(size: 18))
                            .frame(width: 44, height: 44).background(Color.surface, in: Circle())
                        VStack(alignment: .leading, spacing: 3) {
                            Text("You").font(.display(19)).foregroundStyle(Color.ink)
                            Text(viewer.role == .parent
                                 ? "What your counselor knows about you and your family, and where you live"
                                 : "What your counselor knows, your courses and grades, activities").font(.system(size: 14)).foregroundStyle(Color.grayStrong)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer()
                        RoundIcon(icon: "arrow.up.right", fill: .surface)
                    }
                    .padding(16)
                    .background(Color.lavender, in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
                    .softShadow()
                }
                .buttonStyle(.plain)
                CardView {
                    row("Email", viewer.email)
                    Divider().overlay(Color.hairline)
                    row("Account", viewer.role.rawValue.capitalized)
                    Divider().overlay(Color.hairline)
                    PlanRow()
                }

                if viewer.role != .admin {
                    LinkAccountSection()
                    ProWaysSection()
                }
            }

            CardView {
                // Everything not yet native is one tap away on the web,
                // against the same account.
                link("Open Lumni on the web", Config.apiBaseURL)
                Divider().overlay(Color.hairline)
                link("Privacy Policy", Config.apiBaseURL.appending(path: "privacy"))
                Divider().overlay(Color.hairline)
                link("Terms of Service", Config.apiBaseURL.appending(path: "terms"))
            }

            Button("Sign out") { confirmingSignOut = true }
                .buttonStyle(OutlineButtonStyle())
                .confirmationDialog("Sign out of Lumni?", isPresented: $confirmingSignOut, titleVisibility: .visible) {
                    Button("Sign out", role: .destructive) { Task { await model.signOut() } }
                }

            Text("Lumni \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(.system(size: 12)).foregroundStyle(Color.grayMid)
        }
        .navigationTitle("Profile")
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
