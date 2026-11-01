-- E09 semantic search: staff-curated concepts that turn everyday phrases ("comfort food", "no onion garlic") into Catalog searches and filters.
-- Nothing is seeded: the words are product content staff maintain. Search queries are not stored.
CREATE TABLE adv_semantic_search.concept (
    id            uuid          PRIMARY KEY,
    phrase        varchar(60)   NOT NULL UNIQUE,
    search_terms  text[]        NOT NULL,
    food_type     varchar(8)    CHECK (food_type IN ('VEG', 'NON_VEG', 'EGG')),
    spice_level   varchar(8)    CHECK (spice_level IN ('MILD', 'MEDIUM', 'SPICY')),
    category      varchar(80),
    active        boolean       NOT NULL,
    version       bigint        NOT NULL,
    updated_by    uuid          NOT NULL,
    updated_at    timestamptz   NOT NULL,
    CHECK (cardinality(search_terms) <= 4),
    CHECK (cardinality(search_terms) > 0 OR food_type IS NOT NULL OR spice_level IS NOT NULL OR category IS NOT NULL)
);
