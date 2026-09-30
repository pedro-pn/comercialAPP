ALTER TABLE "ProposalNumberReservation"
ADD COLUMN "legacyFirstRevision" INTEGER;

ALTER TABLE "ProposalNumberReservation"
ADD CONSTRAINT "ProposalNumberReservation_legacyFirstRevision_check"
CHECK ("legacyFirstRevision" IS NULL OR "legacyFirstRevision" > 0);
