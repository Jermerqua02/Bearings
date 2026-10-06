import Foundation
import Security

/// The session token, held in the Keychain rather than UserDefaults.
///
/// Most of our users are teenagers, often on shared family devices.
/// `AfterFirstUnlockThisDeviceOnly` keeps the token out of backups and off
/// any other device the backup is restored to.
enum Keychain {
    private static let service = "com.promptllc.bearings"
    private static let account = "session-token"

    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func readToken() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func saveToken(_ token: String) {
        deleteToken()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func deleteToken() {
        SecItemDelete(query as CFDictionary)
    }
}
