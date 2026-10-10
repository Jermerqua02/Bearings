import Foundation

/// Questions to start a conversation with. Four at a time, drawn fresh
/// each time the counselor opens, so the page doesn't read the same twice.
///
/// General on purpose: each one makes sense with no school in mind, and none
/// assumes anything about the student (no invented grades). Arriving from a
/// school page swaps these for questions about that school.
enum Starters {
    static let general = [
        // Building the list
        "What schools am I missing?",
        "Is my list balanced between reach, target and likely?",
        "How many schools should I apply to?",
        "Which of my schools are true safeties?",
        "What should I look for in a college besides rankings?",
        "Should I stay close to home or go far?",
        "Big school or small school — how do I decide?",
        "What's the difference between a college and a university?",
        "Are there schools that fit me that I've never heard of?",
        "How do I tell if a school is a good fit for me?",
        // Chances and standing out
        "Where do I stand right now?",
        "How do I stand out with my grades?",
        "What would make my application stronger this year?",
        "Do my activities tell a clear story?",
        "Should I take the SAT or ACT, or skip testing?",
        "Does a test-optional school really mean optional?",
        "How much do AP and honors classes matter?",
        "Is it too late to start a new activity?",
        "What counts as leadership if I've never been captain of anything?",
        "How do colleges look at a rough freshman year?",
        // Applying
        "Explain early decision vs. early action",
        "Should I apply early anywhere?",
        "What's the Common App, and do all schools use it?",
        "What should I be doing this month?",
        "How do I ask a teacher for a recommendation?",
        "Which teachers should I ask for recommendations?",
        "Do colleges care about demonstrated interest?",
        "Should I do college interviews?",
        "What do I do if I miss a deadline?",
        "How do I keep track of every school's requirements?",
        // Essays
        "How do I pick a personal statement topic?",
        "What makes a college essay memorable?",
        "What should I avoid writing about?",
        "How do I answer a 'why this school' essay?",
        "How personal should my essay be?",
        "How do I write about a challenge without sounding sad?",
        // Paying for it
        "How do I figure out what college will really cost?",
        "What's the difference between net price and sticker price?",
        "What's the FAFSA, and when do I file it?",
        "What's the CSS Profile, and do I need it?",
        "How do merit scholarships work?",
        "Can I negotiate a financial aid offer?",
        "Is a more expensive school ever worth it?",
        "How much student debt is too much?",
        "Does applying for aid hurt my chances?",
        // Bigger picture
        "What if I don't know what I want to major in?",
        "Does it matter where I go to college?",
        "Is community college then transferring a good path?",
        "What's a gap year, and is it a good idea?",
        "How do I talk to my parents about where I want to go?",
    ]

    /// A parent's questions. Their counselor is their own, and they come
    /// with the parent's side of it: money, the calendar, and how to help
    /// without taking over.
    static let parent = [
        // Money and aid
        "How do we figure out what we'd really pay?",
        "What's the difference between sticker price and net price?",
        "When should we fill out the FAFSA, and what do we need?",
        "What's the CSS Profile, and do we need it?",
        "How does having two kids in college at once change aid?",
        "Is a more expensive school ever worth it?",
        "How much should we borrow, if anything?",
        "How do merit scholarships work?",
        "Can we appeal a financial aid offer?",
        "What does in-state tuition mean for us?",
        // The calendar
        "What should we be doing this season?",
        "When should we start visiting colleges?",
        "What deadlines should be on our family calendar?",
        "What happens between applying and decision day?",
        // Helping without taking over
        "How can I help without taking over?",
        "How involved should I be in the essays?",
        "My student seems stressed. What's normal?",
        "How do I bring up money without crushing their hopes?",
        "We disagree about where they should apply. Now what?",
        "My student doesn't know what they want to study. Should I worry?",
        "How do I talk about schools that are far from home?",
        // The list and the choice
        "Is my student's list realistic?",
        "What makes a good safety school?",
        "Explain early decision vs. early action for parents",
        "What should we look for on a campus visit?",
        "How do we compare offers when they come in?",
        "Does it matter where they go to college?",
        "Is community college then transferring a good path?",
        "What's a gap year, and is it a good idea?",
    ]

    /// Questions about one school, for arriving from its page.
    static func about(_ school: School, parent: Bool = false) -> [String] {
        let name = school.shortName
        if parent {
            return [
                "What would \(name) really cost us?",
                "Is \(name) a realistic choice for my student?",
                "Is \(name) worth the money?",
                "What should we ask on a visit to \(name)?",
            ]
        }
        return [
            "What are my chances at \(name)?",
            "Is \(name) worth the money for me?",
            "What would I need to stand out at \(name)?",
            "How does \(name) compare to the rest of my list?",
        ]
    }

    /// `count` starters, a different draw each call — a parent's set for a parent.
    static func draw(_ count: Int = 4, parent: Bool = false) -> [String] {
        Array((parent ? Self.parent : general).shuffled().prefix(count))
    }
}
