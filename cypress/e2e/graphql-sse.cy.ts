describe("SSE", () => {
  it("loads data using graphql-sse", () => {
    cy.visit("/sse");
    cy.get("[data-cy=loading]").should("have.length", 10);
    cy.get("[data-cy=loaded]").should("have.length", 10);
  });
});
