import Foundation
import Observation
import StoreKit

/// Buying Pro with StoreKit 2 (docs/plans/lumni-pro.md, step 3).
///
/// Every purchase carries this account's appAccountToken, so Apple's later
/// notices — renewals, refunds — land on the right account even before the
/// app reports them. Whatever StoreKit hands over (a purchase, a restore, a
/// renewal arriving while the app is open) goes to the server, which checks
/// Apple's signature and records Pro; only then is the transaction finished
/// and the account refreshed.
@Observable
final class ProStore {
    static let shared = ProStore()

    private(set) var monthly: Product?
    private(set) var season: Product?
    /// The free week is offered only to someone who hasn't had it.
    private(set) var trialEligible = false
    private(set) var loading = false
    private(set) var purchasing = false
    var error: String?

    weak var model: AppModel?
    private var token: UUID?
    private var updates: Task<Void, Never>?
    private let api = APIClient.shared

    private struct Info: Decodable {
        struct Ids: Decodable { let monthly: String; let season: String }
        let products: Ids
        let appAccountToken: String
    }

    /// Products and this account's token. Safe to call again.
    func load() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let info: Info = try await api.get("/api/v1/billing/apple")
            token = UUID(uuidString: info.appAccountToken)
            let found = try await Product.products(for: [info.products.monthly, info.products.season])
            monthly = found.first { $0.id == info.products.monthly }
            season = found.first { $0.id == info.products.season }
            if let sub = monthly?.subscription {
                trialEligible = await sub.isEligibleForIntroOffer
            }
            error = nil
        } catch {
            self.error = "Pro isn't available to buy right now. Try again in a moment."
        }
    }

    /// Hear about transactions made elsewhere — a renewal, a purchase
    /// finished on another device, Ask to Buy approved. Once, at sign-in.
    func listen() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result)
            }
        }
    }

    func stopListening() {
        updates?.cancel()
        updates = nil
        token = nil
    }

    func buy(_ product: Product) async {
        guard !purchasing else { return }
        purchasing = true
        defer { purchasing = false }
        error = nil
        do {
            if token == nil { await load() }
            var options: Set<Product.PurchaseOption> = []
            if let token { options.insert(.appAccountToken(token)) }
            switch try await product.purchase(options: options) {
            case .success(let result):
                await handle(result)
            case .pending:
                // Ask to Buy, or a payment that needs attention: it arrives
                // through Transaction.updates when it goes through.
                error = "Your purchase is waiting for approval. Pro turns on as soon as it goes through."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            self.error = "The purchase didn't go through. You haven't been charged."
        }
    }

    /// Restore Purchases: ask the App Store for what this Apple ID owns and
    /// report each to the server.
    func restore() async {
        purchasing = true
        defer { purchasing = false }
        error = nil
        do {
            try await AppStore.sync()
            var found = false
            for await result in Transaction.currentEntitlements {
                found = true
                await handle(result)
            }
            if !found { error = "There's no Lumni Pro purchase on this Apple ID." }
        } catch {
            self.error = "Couldn't reach the App Store. Try again in a moment."
        }
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        // StoreKit's own check first; the server checks Apple's signature again.
        guard case .verified(let transaction) = result else {
            error = "That purchase couldn't be verified."
            return
        }
        struct Body: Encodable { let signedTransaction: String }
        struct Reply: Decodable {}
        do {
            let _: Reply = try await api.post("/api/v1/billing/apple", Body(signedTransaction: result.jwsRepresentation))
            await transaction.finish()
            try? await model?.refresh()
        } catch {
            // Not finished, so StoreKit offers it again next launch.
            self.error = (error as? APIError)?.message ?? "We couldn't confirm that purchase yet. It'll retry, or use Restore Purchases."
        }
    }
}
