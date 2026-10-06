import Foundation

/// A failure the user can read. The server writes these messages for
/// display (see lib/api/v1.ts), so they're shown as-is.
struct APIError: LocalizedError {
    let status: Int
    let message: String

    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }

    static let offline = APIError(status: 0, message: "Can't reach Bearings. Check your connection and try again.")
}

/// HTTP to the Bearings server: /api/v1 for app data, /api/auth for
/// Better Auth's sign-in and sign-out.
///
/// The session lives in a bearer token, never a cookie. Cookies are switched
/// off entirely: Better Auth runs its CSRF origin check on any request that
/// carries one, and a stray cookie from a sign-in response would make every
/// later call fail that check.
final class APIClient {
    static let shared = APIClient()

    /// Called when the server says the token is no longer good, so the app
    /// can drop back to sign-in rather than show a broken screen.
    var onUnauthorized: (() -> Void)?

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.httpCookieStorage = nil
        // Counselor replies are a model call; give them room.
        config.timeoutIntervalForRequest = 90
        session = URLSession(configuration: config)
    }

    var token: String? { Keychain.readToken() }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try decode(await send("GET", path, query: query, body: nil as Empty?))
    }

    func post<T: Decodable>(_ path: String, _ body: some Encodable = Empty()) async throws -> T {
        try decode(await send("POST", path, body: body))
    }

    /// For endpoints that answer 204.
    func perform(_ method: String, _ path: String, _ body: some Encodable = Empty()) async throws {
        _ = try await send(method, path, body: method == "DELETE" ? nil : body)
    }

    // MARK: Auth

    /// Better Auth answers sign-in with the signed session token in
    /// `set-auth-token` (the bearer plugin). That token is the session.
    func signIn(email: String, password: String) async throws {
        struct Body: Encodable { let email: String; let password: String }
        let (data, response) = try await raw("POST", "/api/auth/sign-in/email",
                                             body: Body(email: email, password: password),
                                             authenticated: false)
        try check(data, response)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError(status: 500, message: "Signed in, but the server didn't return a session.")
        }
        Keychain.saveToken(token)
    }

    func signOut() async {
        // Best effort: the server-side session should end, but the local
        // token goes regardless — signing out must always work offline.
        _ = try? await raw("POST", "/api/auth/sign-out", body: Empty(), authenticated: true)
        Keychain.deleteToken()
    }

    // MARK: Plumbing

    struct Empty: Codable {}

    private func send<B: Encodable>(_ method: String, _ path: String,
                                    query: [URLQueryItem] = [], body: B?) async throws -> Data {
        let (data, response) = try await raw(method, path, query: query, body: body, authenticated: true)
        try check(data, response)
        return data
    }

    private func raw<B: Encodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                                   body: B?, authenticated: Bool) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(url: Config.apiBaseURL.appending(path: path),
                                       resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        if authenticated, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await session.data(for: request)
            return (data, response as! HTTPURLResponse)
        } catch {
            throw APIError.offline
        }
    }

    private func check(_ data: Data, _ response: HTTPURLResponse) throws {
        guard !(200..<300).contains(response.statusCode) else { return }

        // /api/v1 sends { error }; Better Auth sends { message, code }.
        struct Body: Decodable { let error: String?; let message: String? }
        let parsed = try? decoder.decode(Body.self, from: data)
        let message = parsed?.error ?? parsed?.message ?? "Something went wrong. Please try again."
        let error = APIError(status: response.statusCode, message: message)

        if error.isUnauthorized { onUnauthorized?() }
        throw error
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[api] decode \(T.self) failed:", error)
            #endif
            throw APIError(status: 0, message: "Bearings sent something this version of the app can't read. Try updating.")
        }
    }
}
