package in.craves.auth.academy;

/** Bayesian knowledge tracing, updated online; parameters are priors, not fitted claims. */
public final class AcademyLearningModel {
    public static final String VERSION = "bkt-prior-v1";
    public static final double INITIAL = 0.25;
    private AcademyLearningModel() { }

    public static double update(double prior, boolean correct) {
        if (!Double.isFinite(prior) || prior < 0 || prior > 1) {
            throw new IllegalArgumentException("Mastery must be between zero and one");
        }
        double slip = 0.10, guess = 0.25, learn = 0.12;
        double evidence = correct ? prior * (1 - slip) : prior * slip;
        double other = correct ? (1 - prior) * guess : (1 - prior) * (1 - guess);
        double posterior = evidence / (evidence + other);
        return Math.max(0.01, Math.min(0.99, posterior + (1 - posterior) * learn));
    }

    public static int score(int correct, int total) {
        if (total < 1 || correct < 0 || correct > total) throw new IllegalArgumentException("Invalid score");
        return (int) Math.round(100.0 * correct / total);
    }

    public static String recommendation(double mastery, int attempts) {
        if (attempts == 0) return "Start with the walkthrough, then try the section quiz.";
        if (mastery < 0.55) return "Revisit the example and source before another quiz attempt.";
        if (mastery < 0.85) return "Practise the scenario and explain the service boundary aloud.";
        return "Try the next module; revisit this one when its source revision changes.";
    }
}
