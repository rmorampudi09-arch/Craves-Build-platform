package in.craves.advanced.taxonomy;

import in.craves.advanced.taxonomy.TaxonomyDtos.AdminTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.Kind;
import in.craves.advanced.taxonomy.TaxonomyDtos.Status;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

/** Pure vocabulary rules, kept apart from the database so they are unit-tested directly. */
final class TaxonomyRules {
    private static final Comparator<AdminTerm> SIBLINGS = Comparator.comparingInt(AdminTerm::sortOrder).thenComparing(AdminTerm::name);

    private TaxonomyRules() { }

    /** Case-, punctuation- and spacing-insensitive form of a label, in any script (marks kept: Indic vowel signs are marks). */
    static String normalise(String label) {
        return label == null ? "" : label.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{M}\\p{N}]+", " ").strip();
    }

    /** Every label a term answers to: its code, its name and its aliases. */
    static Set<String> labels(AdminTerm term) {
        Set<String> keys = new LinkedHashSet<>();
        keys.add(normalise(term.code()));
        keys.add(normalise(term.name()));
        term.aliases().forEach(alias -> keys.add(normalise(alias)));
        keys.remove("");
        return keys;
    }

    /** Labels claimed by more than one live term; they would make resolving free text ambiguous. */
    static Set<String> collisions(Collection<AdminTerm> terms) {
        Map<String, String> owner = new HashMap<>();
        Set<String> clashes = new TreeSet<>();
        for (AdminTerm term : terms) {
            if (term.status() != Status.ACTIVE) continue;
            for (String key : labels(term)) {
                String previous = owner.putIfAbsent(key, term.code());
                if (previous != null && !previous.equals(term.code())) clashes.add(key);
            }
        }
        return clashes;
    }

    /** Live terms in tree order: siblings by sortOrder then name, each followed by its own children. */
    static List<AdminTerm> treeOrder(Collection<AdminTerm> terms) {
        Map<String, List<AdminTerm>> children = terms.stream().filter(term -> term.status() == Status.ACTIVE)
                .collect(Collectors.groupingBy(term -> term.parentCode() == null ? "" : term.parentCode()));
        List<AdminTerm> ordered = new ArrayList<>();
        walk("", children, ordered);
        return ordered;
    }

    private static void walk(String parent, Map<String, List<AdminTerm>> children, List<AdminTerm> out) {
        for (AdminTerm term : children.getOrDefault(parent, List.of()).stream().sorted(SIBLINGS).toList()) {
            out.add(term);
            walk(term.code(), children, out);
        }
    }

    /** The code and every term below it, retired ones included (a dish stays South Indian when a sub-cuisine is retired). */
    static Set<String> subtree(String code, Collection<AdminTerm> terms) {
        Map<String, List<String>> children = terms.stream().filter(term -> term.parentCode() != null)
                .collect(Collectors.groupingBy(AdminTerm::parentCode, Collectors.mapping(AdminTerm::code, Collectors.toList())));
        Set<String> found = new LinkedHashSet<>();
        Deque<String> work = new ArrayDeque<>(List.of(code));
        while (!work.isEmpty()) {
            String next = work.pop();
            if (found.add(next)) work.addAll(children.getOrDefault(next, List.of()));
        }
        return found;
    }

    /** True when placing {@code code} under {@code parent} would make it its own ancestor. */
    static boolean createsCycle(String code, String parent, Map<String, AdminTerm> byCode) {
        Set<String> seen = new HashSet<>();
        for (String at = parent; at != null && seen.add(at); at = byCode.containsKey(at) ? byCode.get(at).parentCode() : null) {
            if (at.equals(code)) return true;
        }
        return false;
    }

    /** Codes that are not live terms of the expected kind. */
    static List<String> unknown(List<String> cuisines, List<String> diets, Map<String, AdminTerm> byCode) {
        List<String> unknown = new ArrayList<>();
        cuisines.stream().filter(code -> !live(byCode.get(code), Kind.CUISINE)).forEach(unknown::add);
        diets.stream().filter(code -> !live(byCode.get(code), Kind.DIET)).forEach(unknown::add);
        return unknown;
    }

    static boolean live(AdminTerm term, Kind kind) {
        return term != null && term.kind() == kind && term.status() == Status.ACTIVE;
    }
}
