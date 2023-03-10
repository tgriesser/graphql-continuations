describe("Websockets", () => {
  it("loads data using graphql-ws", () => {
    cy.visit("/ws");
    cy.get("[data-cy=loading]").should("have.length", 10);
    cy.get("[data-cy=loaded]").should("have.length", 10);
  });
});
