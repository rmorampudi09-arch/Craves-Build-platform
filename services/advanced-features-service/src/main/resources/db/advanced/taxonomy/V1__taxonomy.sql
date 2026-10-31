-- E10 regional cuisine and dietary taxonomy: a staff-maintained vocabulary and each dish's cuisine and diet labels.
-- Terms are never deleted (staff retire them) and codes never change, so dish labels can keep plain code arrays.
CREATE TABLE adv_taxonomy.term (
    code         varchar(40)   PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9-]{1,39}$'),
    kind         varchar(8)    NOT NULL CHECK (kind IN ('CUISINE', 'DIET')),
    parent_code  varchar(40)   REFERENCES adv_taxonomy.term (code),
    name         varchar(60)   NOT NULL,
    description  varchar(300),
    aliases      text[]        NOT NULL DEFAULT '{}',
    sort_order   integer       NOT NULL DEFAULT 0,
    status       varchar(8)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
    version      bigint        NOT NULL DEFAULT 1,
    updated_by   uuid,
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    CHECK (kind = 'CUISINE' OR parent_code IS NULL)
);
CREATE INDEX term_parent_idx ON adv_taxonomy.term (parent_code);

CREATE TABLE adv_taxonomy.dish_tags (
    menu_item_id uuid         PRIMARY KEY,
    chef_id      uuid         NOT NULL,
    cuisines     text[]       NOT NULL CHECK (cardinality(cuisines) BETWEEN 1 AND 3),
    diets        text[]       NOT NULL DEFAULT '{}' CHECK (cardinality(diets) <= 6),
    set_by       varchar(5)   NOT NULL CHECK (set_by IN ('CHEF', 'STAFF')),
    version      bigint       NOT NULL,
    updated_by   uuid         NOT NULL,
    updated_at   timestamptz  NOT NULL
);
CREATE INDEX dish_tags_cuisines_idx ON adv_taxonomy.dish_tags USING gin (cuisines);
CREATE INDEX dish_tags_diets_idx ON adv_taxonomy.dish_tags USING gin (diets);

-- Baseline vocabulary (names only, no commercial values). Staff edit, add or retire terms through the admin API.
INSERT INTO adv_taxonomy.term (code, kind, parent_code, name, description, aliases, sort_order) VALUES
('south-indian', 'CUISINE', NULL, 'South Indian', 'Food from Telangana, Andhra Pradesh, Karnataka, Tamil Nadu and Kerala.', '{}', 10),
('north-indian', 'CUISINE', NULL, 'North Indian', 'Food from Punjab, Delhi, Uttar Pradesh, Kashmir and Rajasthan.', '{}', 20),
('west-indian', 'CUISINE', NULL, 'West Indian', 'Food from Gujarat, Maharashtra and Goa.', '{}', 30),
('east-indian', 'CUISINE', NULL, 'East Indian', 'Food from Bengal, Odisha and Bihar.', '{}', 40),
('north-east-indian', 'CUISINE', NULL, 'North-East Indian', 'Food from Assam and the north-eastern states.', '{northeast,"north eastern"}', 50),
('indo-chinese', 'CUISINE', NULL, 'Indo-Chinese', 'Indian-style Chinese food such as Manchurian, Hakka noodles and chilli paneer.', '{"indian chinese",chinese}', 60),
('continental', 'CUISINE', NULL, 'Continental', 'European-style food such as pasta, bakes and grills.', '{western,european}', 70);

INSERT INTO adv_taxonomy.term (code, kind, parent_code, name, description, aliases, sort_order) VALUES
('hyderabadi', 'CUISINE', 'south-indian', 'Hyderabadi', 'The Nizami kitchen of Hyderabad: biryani, haleem, mirchi ka salan.', '{hyderabad,hyd,deccani,nizami}', 10),
('telangana', 'CUISINE', 'south-indian', 'Telangana', 'Telangana home food: pachi pulusu, sarva pindi, sakinalu.', '{"telangana style"}', 20),
('andhra', 'CUISINE', 'south-indian', 'Andhra', 'Andhra home food: pappu, pulihora, gongura pachadi, Guntur chilli dishes.', '{"andhra style","andhra pradesh",guntur}', 30),
('karnataka', 'CUISINE', 'south-indian', 'Karnataka', 'Karnataka home food: bisi bele bath, ragi mudde, Mysore dishes.', '{kannada,mysore}', 40),
('tamil', 'CUISINE', 'south-indian', 'Tamil', 'Tamil Nadu home food: kuzhambu, poriyal, pongal.', '{"tamil nadu",tamilian}', 50),
('kerala', 'CUISINE', 'south-indian', 'Kerala', 'Kerala food: appam, stew, avial, puttu and Malabar dishes.', '{malabar,malayali}', 60),
('punjabi', 'CUISINE', 'north-indian', 'Punjabi', 'Punjabi food: dal makhani, chole, sarson da saag, parathas.', '{punjab}', 10),
('mughlai', 'CUISINE', 'north-indian', 'Mughlai', 'Mughal-court dishes: kormas, kebabs, biryanis.', '{}', 20),
('awadhi', 'CUISINE', 'north-indian', 'Awadhi', 'Slow-cooked Lucknow dishes: dum biryani, galouti, nihari.', '{lucknowi,lucknow}', 30),
('kashmiri', 'CUISINE', 'north-indian', 'Kashmiri', 'Kashmiri food: rogan josh, yakhni, dum aloo.', '{kashmir}', 40),
('rajasthani', 'CUISINE', 'north-indian', 'Rajasthani', 'Rajasthani food: dal baati churma, gatte ki sabzi, laal maas.', '{rajasthan,marwari}', 50),
('gujarati', 'CUISINE', 'west-indian', 'Gujarati', 'Gujarati food: dhokla, thepla, undhiyu.', '{gujarat}', 10),
('maharashtrian', 'CUISINE', 'west-indian', 'Maharashtrian', 'Maharashtrian food: misal pav, puran poli, varan bhaat.', '{marathi,maharashtra}', 20),
('goan', 'CUISINE', 'west-indian', 'Goan', 'Goan food: fish curry rice, xacuti, vindaloo.', '{goa}', 30),
('parsi', 'CUISINE', 'west-indian', 'Parsi', 'Parsi food: dhansak, patra ni machhi, salli boti.', '{}', 40),
('bengali', 'CUISINE', 'east-indian', 'Bengali', 'Bengali food: machher jhol, shukto, kosha mangsho.', '{bengal,kolkata}', 10),
('odia', 'CUISINE', 'east-indian', 'Odia', 'Odia food: dalma, pakhala, chhena poda.', '{oriya,odisha,orissa}', 20),
('bihari', 'CUISINE', 'east-indian', 'Bihari', 'Bihari food: litti chokha, sattu paratha.', '{bihar}', 30),
('assamese', 'CUISINE', 'north-east-indian', 'Assamese', 'Assamese food: masor tenga, khar, pitha.', '{assam}', 10),
('naga', 'CUISINE', 'north-east-indian', 'Naga', 'Naga food: smoked pork, bamboo shoot, axone.', '{nagaland}', 20);

INSERT INTO adv_taxonomy.term (code, kind, parent_code, name, description, aliases, sort_order) VALUES
('udupi', 'CUISINE', 'karnataka', 'Udupi', 'Udupi temple-style vegetarian food: dosa, idli, sambar, rasam.', '{}', 10),
('mangalorean', 'CUISINE', 'karnataka', 'Mangalorean', 'Coastal Karnataka food: ghee roast, kori rotti, neer dosa.', '{mangalore}', 20),
('chettinad', 'CUISINE', 'tamil', 'Chettinad', 'Peppery Chettinad food from Tamil Nadu.', '{}', 10);

INSERT INTO adv_taxonomy.term (code, kind, parent_code, name, description, aliases, sort_order) VALUES
('jain', 'DIET', NULL, 'Jain', 'No meat, fish, eggs, onion, garlic or root vegetables, as declared by the chef.', '{}', 10),
('no-onion-garlic', 'DIET', NULL, 'No onion, no garlic', 'Cooked without onion or garlic, as declared by the chef.', '{"without onion and garlic"}', 20),
('satvik', 'DIET', NULL, 'Satvik', 'Simple vegetarian food without onion, garlic, eggs or meat, as declared by the chef.', '{sattvic,sathvik}', 30),
('vegan', 'DIET', NULL, 'Vegan', 'No meat, fish, eggs, dairy or honey, as declared by the chef.', '{"plant based"}', 40),
('vrat', 'DIET', NULL, 'Fasting (vrat)', 'Made only with ingredients eaten on fasting days, as declared by the chef.', '{fasting,upvas,navratri}', 50),
('halal', 'DIET', NULL, 'Halal', 'Meat from halal sources, as declared by the chef.', '{}', 60);
