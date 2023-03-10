describe("Query", () => {
  it("loads data using fetch", () => {
    cy.visit("/query");
    cy.get("[data-cy=loading]").should("have.length", 10);
    cy.get("[data-cy=loaded]").should("have.length", 10);
  });
});
