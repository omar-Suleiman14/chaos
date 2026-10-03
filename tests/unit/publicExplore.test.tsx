import { describe,expect,it,vi } from "vitest";
import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import PublicExplore from "@/components/site/PublicExplore";
const backend=vi.hoisted(()=>({paginate:vi.fn(),loadMore:vi.fn(),create:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock("convex/react",()=>({usePaginatedQuery:backend.paginate,useMutation:()=>backend.create}));
vi.mock("@/lib/learn/data",()=>({useLearnViewer:()=>({signedIn:false})}));
vi.mock("@/lib/i18n",()=>({useLocale:()=>({locale:"en"})}));
vi.mock("@/components/site/SiteChrome",()=>({SiteNav:()=> <nav>Explore</nav>,SiteFooter:()=> <footer>Chaos</footer>}));
vi.mock("@/components/workspace/Select",()=>({Select:({label}:{label:string})=><button>{label}</button>}));
const courses=[{id:"course-1",title:"Biology basics",description:"Cells",language:"en",tags:[],lessons:2,ownerName:"Author",updatedAt:1}];
describe("public course discovery",()=>{
 it("lists only courses and allows unsigned browsing with pagination",()=>{
  backend.paginate.mockReturnValue({results:courses,status:"CanLoadMore",loadMore:backend.loadMore});
  render(<PublicExplore/>);
  expect(screen.getByRole("link",{name:/Biology basics/})).toHaveAttribute("href","/learn/courses/course-1");
  expect(screen.queryByRole("button",{name:/sign in/i})).toBeNull();
  expect(screen.queryByRole("button",{name:"Create course"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Load more courses"})); expect(backend.loadMore).toHaveBeenCalledWith(24);
 });
 it("debounces indexed search instead of navigating for every keystroke",async()=>{
  backend.paginate.mockReturnValue({results:[],status:"Exhausted",loadMore:backend.loadMore}); render(<PublicExplore/>);
  fireEvent.change(screen.getByRole("searchbox"),{target:{value:"biology"}});
  await waitFor(()=>expect(backend.paginate).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({text:"biology",sort:"relevant"}),{initialNumItems:24}));
 });
});
