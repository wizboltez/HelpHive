-- Flat numbers a building has, as the admin typed them, e.g. "101-104, 201-204, G1".
-- Empty means residents type their flat number themselves.
ALTER TABLE buildings ADD COLUMN flat_ranges text NOT NULL DEFAULT '';
