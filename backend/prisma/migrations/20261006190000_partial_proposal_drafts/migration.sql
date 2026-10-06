-- A seleção pode ficar vazia durante a edição do rascunho. Fora do rascunho,
-- continua obrigatório ter exatamente um consultor; dois vínculos nunca são aceitos.
ALTER TABLE "Proposal"
    DROP CONSTRAINT "Proposal_seller_reference_check",
    ADD CONSTRAINT "Proposal_seller_reference_check" CHECK (
        ("sellerUserId" IS NOT NULL) <> ("sellerConsultantId" IS NOT NULL)
        OR ("status" = 'RASCUNHO' AND "sellerUserId" IS NULL AND "sellerConsultantId" IS NULL)
    );
