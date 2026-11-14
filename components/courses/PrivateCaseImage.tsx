"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** Render private clinical media through an authenticated, rechecked Convex proxy.
 * No R2 signed GET URL is exposed and no image is cached beyond this component. */
export default function PrivateCaseImage({mediaId,alt}:{mediaId:Id<"questionBankMedia">;alt:string}) {
  const url=useQuery(api.questionBankMedia.getContentUrl,{mediaId});
  const {getToken}=useAuth();
  const [src,setSrc]=useState<string|null>(null);
  useEffect(()=>{
    if(!url)return;
    const controller=new AbortController();
    let blobUrl:string|null=null;
    const load=async()=>{
      try {
        const token=await getToken({template:"convex"});
        if(!token)return;
        const response=await fetch(url,{headers:{Authorization:"Bearer "+token},
          cache:"no-store",signal:controller.signal});
        if(!response.ok)return;
        const blob=await response.blob();
        if(controller.signal.aborted)return;
        blobUrl=URL.createObjectURL(blob);
        setSrc(blobUrl);
      }catch{/* Fail closed: alt text remains available. */}
    };
    void load();
    return ()=>{controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
  },[url,getToken]);
  if(!src)return <span className="text-sm text-muted-foreground" dir="auto">{alt}</span>;
  return <img src={src} alt={alt} className="max-h-52 max-w-full rounded-lg border border-border object-contain"/>;
}
