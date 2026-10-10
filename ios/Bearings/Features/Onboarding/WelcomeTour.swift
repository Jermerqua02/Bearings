import SwiftUI

/// The first thing a new account sees: what Lumni does for them, in a few
/// pages they can swipe through, ending on what Pro adds and why it's worth
/// it. Then the first meeting — the questions that make all of it personal.
///
/// It sells Pro without asking for money here: the trial is offered once
/// the questions are done, when the app has something personal to show.
/// "See Pro plans" is there for anyone ready now.
struct WelcomeTour: View {
    let isParent: Bool
    let begin: () -> Void
    let close: () -> Void

    @State private var page = 0
    @State private var plans = false

    private var pages: [TourPage] { isParent ? TourPage.parent : TourPage.student }
    private var last: Int { pages.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                if page < last {
                    Button("Skip") { withAnimation { page = last } }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.grayStrong)
                } else {
                    Button { close() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)) }
                        .foregroundStyle(Color.grayStrong)
                        .accessibilityLabel("Close")
                }
            }
            .frame(height: 44)
            .padding(.horizontal, 20)

            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.offset) { i, p in
                    TourPageView(page: p, first: i == 0).tag(i)
                }
                WhyPro(isParent: isParent).tag(last)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .clipped()

            VStack(spacing: 14) {
                PageDots(count: last + 1, current: page)
                if page < last {
                    Button("Next") { withAnimation { page += 1 } }
                        .buttonStyle(PrimaryButtonStyle())
                } else {
                    Text("Pro Monthly starts with 7 days free for new subscribers. You'll see the plans when your profile is ready — no need to decide now.")
                        .font(.system(size: 13)).foregroundStyle(Color.grayStrong)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(isParent ? "Set up my profile" : "Start my first meeting", action: begin)
                        .buttonStyle(PrimaryButtonStyle())
                    Button("See Pro plans") { plans = true }
                        .buttonStyle(LinkButtonStyle(color: .accent))
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, 12)
            .frame(minHeight: 120, alignment: .top)
        }
        .background(Color.paper)
        .sheet(isPresented: $plans) {
            ProPaywall(reason: PaywallReason(message: nil)).presentationBackground(Color.paper)
        }
    }
}

// MARK: Pages

private struct TourPage {
    let icon: String
    let lead: String
    let rest: String
    let detail: String
    /// What part of this is Pro, said plainly, or nil when it's all free.
    var pro: String?

    static let student: [TourPage] = [
        TourPage(icon: "graduationcap", lead: "Welcome to Lumni.",
                 rest: "The college counselor most families can't hire.",
                 detail: "Where to apply, what it would cost, and how to get in — worked out for you, not for an average student."),
        TourPage(icon: "scope", lead: "Schools that fit you.",
                 rest: "Not a ranking.",
                 detail: "Picks built from your grades, your budget and what you care about, with your chances at each one: reach, target or likely.",
                 pro: "Chances and picks are Pro"),
        TourPage(icon: "dollarsign.circle", lead: "What it would really cost.",
                 rest: "Not the sticker price.",
                 detail: "In-state tuition, regional discounts like WUE, and aid for a family like yours. Plenty of students rule out schools they could have afforded.",
                 pro: "Your real cost is Pro"),
        TourPage(icon: "sparkles", lead: "A counselor whenever you need her.",
                 rest: "She remembers you.",
                 detail: "Ask about essays, schools, money, or what to do this week. Then practice interviews out loud and hear honest feedback.",
                 pro: "The counselor and interview practice are Pro"),
        TourPage(icon: "checklist", lead: "Every deadline in one place.",
                 rest: "Nothing slips.",
                 detail: "Track each application from first look to decision, see what's due this week, and get reminders before it matters.",
                 pro: "Deadline dates are free; the full plan and reminders are Pro"),
    ]

    static let parent: [TourPage] = [
        TourPage(icon: "graduationcap", lead: "Welcome to Lumni.",
                 rest: "Honest help for the parent's side of college.",
                 detail: "Where things stand, what it will cost, and what's coming next — without becoming your student's project manager."),
        TourPage(icon: "eye", lead: "See where things stand.",
                 rest: "Without asking at dinner.",
                 detail: "Link with your student to see their list, application statuses and deadlines. Their counselor conversations and essays stay private unless they share them."),
        TourPage(icon: "dollarsign.circle", lead: "What it would really cost.",
                 rest: "Not the sticker price.",
                 detail: "Net price for a family like yours — in-state tuition, regional discounts and aid — so the money conversation starts from real numbers.",
                 pro: "Real costs are Pro"),
        TourPage(icon: "calendar", lead: "The season, explained.",
                 rest: "What's normal right now.",
                 detail: "What your student should be doing this season, the money milestones on the calendar, and how to help without hovering.",
                 pro: "Season guidance is Pro"),
    ]
}

private struct TourPageView: View {
    let page: TourPage
    let first: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if first {
                    GraduateView().frame(height: 220).frame(maxWidth: .infinity)
                } else {
                    Image(systemName: page.icon)
                        .font(.system(size: 30, weight: .semibold)).foregroundStyle(.white)
                        .frame(width: 76, height: 76)
                        .background(Color.accent, in: Circle())
                        .padding(.top, 40)
                        .accessibilityHidden(true)
                }
                TwoTone(lead: page.lead, rest: page.rest, size: 32)
                Text(page.detail)
                    .font(.system(size: 17)).foregroundStyle(Color.grayStrong)
                    .fixedSize(horizontal: false, vertical: true)
                if let pro = page.pro {
                    HStack(spacing: 8) {
                        ProBadge()
                        Text(pro).font(.system(size: 14, weight: .medium)).foregroundStyle(Color.ink)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
    }
}

/// The last page: Free and Pro side by side, and the trial.
private struct WhyPro: View {
    let isParent: Bool

    private var free: [String] {
        isParent
            ? ["Your student's list and deadlines, once you link", "Published numbers for 40 hand-picked schools"]
            : ["40 hand-picked schools and their published numbers", "A list of up to 5 schools, with deadline dates", "Two messages with the counselor, to try her out"]
    }

    private var pro: [String] {
        isParent
            ? ["What each school would really cost your family", "What's normal this season, and how to help", "Every school, not just 40", "Shared with your linked student — one Pro covers you both"]
            : ["Your chances at every school", "What each one would really cost you", "Your counselor, whenever you need her", "Interview practice with spoken feedback", "Picks within reach, and why they fit", "Your full application plan and reminders"]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                TwoTone(lead: "Free gets you started.", rest: "Pro makes it yours.", size: 28)
                    .padding(.top, 8)

                CardView {
                    SectionLabel("Free")
                    ForEach(free, id: \.self) { Row(text: $0, icon: "checkmark", color: .grayStrong) }
                }
                CardView(tint: .lavender) {
                    HStack(spacing: 8) { SectionLabel("Pro", color: .ink); Spacer() }
                    ForEach(pro, id: \.self) { Row(text: $0, icon: "checkmark.circle.fill", color: .accent) }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private struct Row: View {
        let text: String
        let icon: String
        let color: Color

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundStyle(color)
                Text(text).font(.system(size: 15)).foregroundStyle(Color.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct PageDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i == current ? Color.ink : Color.mistStrong)
                    .frame(width: i == current ? 18 : 6, height: 6)
            }
        }
        .animation(.snappy(duration: 0.25), value: current)
        .accessibilityElement()
        .accessibilityLabel("Page \(current + 1) of \(count)")
    }
}
