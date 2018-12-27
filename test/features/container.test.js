describe("Container", () => {
  let webExtension, background;

  describe("Add-on initializes", () => {
    describe("No Container with name Amazon exists", () => {
      beforeEach(async () => {
        webExtension = await loadWebExtension();
        background = webExtension.background;
      });

      it("should create a new Amazon Container", () => {
        expect(background.browser.contextualIdentities.create).to.have.been.calledWithMatch({
          name: "Amazon"
        });
      });
    });

    describe("Container with name Amazon already exists", () => {
      beforeEach(async () => {
        webExtension = await loadWebExtension({
          async beforeParse(window) {
            await window.browser.contextualIdentities._create({
              name: "Amazon"
            });
          }
        });
        background = webExtension.background;
      });

      it("should not create a new Container", () => {
        expect(background.browser.contextualIdentities.create).to.not.have.been.called;
      });
    });
  });
});
