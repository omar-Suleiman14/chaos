import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PublicAuthors from "@/components/site/PublicAuthors";
const backend = vi.hoisted(() => ({ paginate: vi.fn(), loadMore: vi.fn() }));
vi.mock("convex/react", () => ({ usePaginatedQuery: backend.paginate }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("@/lib/cardFonts", () => ({ cardRuqaa: { variable: "ruqaa" } }));
vi.mock("@/components/site/SiteChrome", () => ({ SiteNav: () => <nav>Chaos</nav>, SiteFooter: () => <footer>Chaos</footer> }));
const authors = Array.from({length: 30}, (_, i) => ({name: "Author " + i, username: "author" + i, seed: "seed" + i, memberSince: 1, style: 0}));
beforeEach(() => { vi.clearAllMocks(); backend.paginate.mockReturnValue({results: authors, status: "Exhausted", loadMore: backend.loadMore}); });
describe("author card directory", () => {
 it("keeps rendering bounded and links to the existing member card", () => {
   const {container} = render(<PublicAuthors/>);
   expect(container.querySelectorAll(".author-stack-card").length).toBeLessThanOrEqual(5);
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author0");
   fireEvent.keyDown(screen.getByRole("region", {name: "Author cards"}), {key: "ArrowRight"});
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author1");
   const stage = screen.getByRole("region", {name:"Author cards"});
   fireEvent.keyDown(stage, {key:"ArrowDown"});
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author2");
   fireEvent.keyDown(stage, {key:"Home"});
   fireEvent.click(screen.getByRole("button", {name: "Previous author"}));
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author29");
   fireEvent.click(screen.getByRole("button", {name: "Next author"}));
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author0");
 });
 it("continues past filtered empty pages rather than claiming no authors exist", () => {
   backend.paginate.mockReturnValue({results: [], status: "CanLoadMore", loadMore: backend.loadMore});
   render(<PublicAuthors/>);
   expect(backend.loadMore).toHaveBeenCalledWith(24);
   expect(screen.getByRole("status")).toHaveTextContent("Finding authors");
 });
 it("handles reactive removal of the selected author", () => {
   const {rerender} = render(<PublicAuthors/>);
   fireEvent.keyDown(screen.getByRole("region", {name: "Author cards"}), {key: "ArrowRight"});
   backend.paginate.mockReturnValue({results: authors.slice(0,1), status: "Exhausted", loadMore: backend.loadMore});
   rerender(<PublicAuthors/>);
   expect(screen.getByRole("link", {name: /View card of/})).toHaveAttribute("href", "/card/author0");
 });
});
