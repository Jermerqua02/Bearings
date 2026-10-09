import SwiftUI

/// Sign in and sign up, on one screen with a toggle between them.
struct AuthView: View {
    @Environment(AppModel.self) private var model
    @State private var creating = false
    @State private var form = SignUpForm()
    @State private var busy = false
    @State private var error: String?

    /// Same rule as SignUpForm.tsx and signUpWithRole.
    private let passwordMin = 10
    private let minimumAge = 13

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 10) {
                    Image("Wordmark")
                        .resizable().scaledToFit()
                        .frame(height: 30)
                        .padding(.bottom, 12)
                        .accessibilityLabel("Lumni")
                    Text(creating ? "Make an account." : "Welcome back.")
                        .font(.headline1)
                    Text("An honest college counselor, always available.")
                        .foregroundStyle(Color.grayStrong)
                }
                .padding(.top, 48)

                VStack(spacing: 22) {
                    if creating {
                        RuledField(label: "First name", text: $form.name, content: .givenName)
                    }
                    RuledField(label: "Email", text: $form.email, content: .emailAddress, keyboard: .emailAddress)
                    RuledField(label: "Password", text: $form.password, secure: true,
                               content: creating ? .newPassword : .password)
                }

                if creating { signUpExtras }

                if let error {
                    Text(error).font(.system(size: 15)).foregroundStyle(Color.ink)
                }

                if !creating {
                    // The reset flow lives on the web: the emailed link opens
                    // there, and the new password works here straight away.
                    Link("Forgot password?",
                         destination: Config.apiBaseURL.appending(path: "forgot-password"))
                        .font(.system(size: 15))
                        .foregroundStyle(Color.accent)
                }

                Button(action: submit) {
                    if busy { ProgressView().tint(.white) } else { Text(creating ? "Create account" : "Sign in") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy || !canSubmit)

                Button(creating ? "Already have an account? Sign in" : "New here? Create an account") {
                    creating.toggle()
                    error = nil
                }
                .font(.system(size: 15))
                .foregroundStyle(Color.accent)
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .background(Color.paper)
        .scrollDismissesKeyboard(.interactively)
    }

    private var signUpExtras: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("I am a")
                Picker("I am a", selection: $form.role) {
                    Text("Student").tag(Role.student)
                    Text("Parent").tag(Role.parent)
                }
                .pickerStyle(.segmented)
            }

            Toggle(isOn: Binding(get: { form.acceptedTerms },
                                 set: { form.acceptedTerms = $0; form.meetsAgeRequirement = $0 })) {
                Text("I'm at least \(minimumAge) years old and I agree to the [Terms of Service](\(Config.apiBaseURL.appending(path: "terms"))) and [Privacy Policy](\(Config.apiBaseURL.appending(path: "privacy"))).")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.grayStrong)
            }
            .toggleStyle(CheckboxStyle())
        }
    }

    private var canSubmit: Bool {
        guard !form.email.isEmpty, !form.password.isEmpty else { return false }
        return !creating || (!form.name.isEmpty && form.acceptedTerms)
    }

    private func submit() {
        if creating && form.password.count < passwordMin {
            error = "Password must be at least \(passwordMin) characters."
            return
        }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                if creating {
                    try await model.signUp(form)
                } else {
                    try await model.signIn(email: form.email, password: form.password)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

struct CheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .stroke(configuration.isOn ? Color.accent : Color.grayMid, lineWidth: 1)
                    .background(configuration.isOn ? Color.accent : .clear, in: RoundedRectangle(cornerRadius: 2))
                    .overlay {
                        if configuration.isOn {
                            Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                        }
                    }
                    .frame(width: 18, height: 18)
                    .padding(.top, 2)
                configuration.label.multilineTextAlignment(.leading)
            }
        }
        .buttonStyle(.plain)
    }
}
