describe("Cookies", () => {
  let webExtension, background;

  describe("Add-on initializes", () => {
    beforeEach(async () => {
      webExtension = await loadWebExtension({
        async beforeParse(window) {
          const amazonContainer = await window.browser.contextualIdentities.create({
            name: "Amazon"
          });
          await window.browser.cookies.set({
            name: "tracking",
            value: "1",
            url: "https://www.amazon.com"
          });
          await window.browser.cookies.set({
            name: "tracking",
            value: "1",
            storeId: "firefox-container-1",
            url: "https://www.amazon.com"
          });
          await window.browser.cookies.set({
            name: "contained-tracking",
            value: "1",
            storeId: amazonContainer.cookieStoreId,
            url: "https://www.amazon.com"
          });
        }
      });
      background = webExtension.background;
    });

    it("should wipe cookies in all containers except the Amazon Container", async () => {
      const cookies = await background.browser.cookies.getAll({});
      expect(cookies.length).to.equal(1);
      expect(cookies[0].name).to.equal("contained-tracking");
    });
  });
});