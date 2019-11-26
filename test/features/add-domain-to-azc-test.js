describe("Add domain to Amazon Container", () => {
    let webExtension, background;
  
    beforeEach(async () => {
      webExtension = await loadWebExtension();
      background = webExtension.background;
    });
  
    describe("runtime message add-to-amazon-container", () => {
      beforeEach(async () => {
        await background.browser.runtime.onMessage.addListener.yield("add-to-amazon-container", {
          url: "https://example.com"
        });
      });
  
      describe("runtime message what-sites-are-added", () => {
        it("should return the added sites", async () => {
          const [promise] = await background.browser.runtime.onMessage.addListener.yield("what-sites-are-added", {});
          const sites = await promise;
          expect(sites.includes("example.com")).to.be.true;
        });
      });
  
  
      describe("runtime message removeDomain", () => {
        it("should have removed the domain", async () => {
          await background.browser.runtime.onMessage.addListener.yield({
            removeDomain: "example.com"
          }, {});
  
          const [promise] = await background.browser.runtime.onMessage.addListener.yield("what-sites-are-added", {});
          const sites = await promise;
          expect(sites.includes("example.com")).to.be.false;
        });
      });
    });
  
  });