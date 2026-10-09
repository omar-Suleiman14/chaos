import {writeFileSync} from 'node:fs';
import {Suspense} from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {it,vi} from 'vitest';
import {LocaleProvider} from '@/lib/i18n';
const fixture=vi.hoisted(()=>({lang:'en'}));
vi.mock('convex/react',()=>({useConvexAuth:()=>({isAuthenticated:false}),useConvex:()=>({query:vi.fn(),mutation:vi.fn()}),useQuery:(_ref:unknown,args:unknown)=>args==='skip'?undefined:{id:'demo',title:fixture.lang==='ar'?'دورة تدريبية':'Demo course',description:fixture.lang==='ar'?'مقدمة الدورة والدروس':'An introduction to the course and its lessons.',language:fixture.lang,tags:[],lessons:[],pendingChanges:[],published:false,visibility:'public',coverUrl:'https://fixture.invalid/cover.svg',isOwner:false},useMutation:()=>vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useParams:()=>({lang:fixture.lang})}));
vi.mock('@/lib/learn/mediaClient',()=>({useLearnMediaClient:()=>({resolve:vi.fn(),upload:vi.fn()})}));
import CourseBuilder from '@/app/[lang]/(app)/dashboard/courses/[id]/page';
it('exports the actual course editor with its actual cover picker',async()=>{
for(const lang of ['en','ar'] as const){fixture.lang=lang;
await act(async()=>{render(<LocaleProvider initial={lang}><Suspense><CourseBuilder params={Promise.resolve({id:'demo'})}/></Suspense></LocaleProvider>)});
await screen.findByRole('textbox',{name:lang==='en'?'Course title':'عنوان الدورة'});
writeFileSync(`/workspace/.cloud-setup/chaos/merge-screenshots/markup/cover-${lang}.html`,document.body.innerHTML);
fireEvent.click(screen.getByRole('button',{name:lang==='en'?'Change cover':'غيّر الغلاف'}));
writeFileSync(`/workspace/.cloud-setup/chaos/merge-screenshots/markup/cover-picker-${lang}.html`,document.body.innerHTML);
cleanup();}
});
