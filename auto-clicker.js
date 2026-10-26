(() => {
  document.getElementById("ot8")?.remove();
  if (window.__ot8_cleanup) try { window.__ot8_cleanup(); } catch(e) {}

  const S = {rows:[], timers:[], debugTimers:[], stopped:false, no:1, pendingRow:null, pendingSince:0};

  const time = d => {
    d=d||new Date();
    return d.toLocaleTimeString("en-GB",{hour12:false})+"."+String(d.getMilliseconds()).padStart(3,"0");
  };

  const parse = s => {
    const m=s.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
    if(!m) return null;
    const d=new Date(), ms=+(m[4].padEnd(3,"0"));
    const h=+m[1], mi=+m[2], se=+m[3];
    if(h>23||mi>59||se>59) return null;
    d.setHours(h,mi,se,ms); return d;
  };

  const realId = v => v!=null && String(v).trim()!=="" &&
    !["null","undefined"].includes(String(v).trim().toLowerCase());

  function info(text){
    let errorCode="", orderId="";
    try {
      const x=JSON.parse(text);
      // به‌جای چک کردن فقط نام دقیق errorCode/orderId، هر کلیدی که شبیه این‌هاست را می‌گیرد
      // (errorCode, error_code, ErrCode, order_id, orderID, ...)
      const walk=o=>{
        if(!o||typeof o!=="object") return;
        Object.entries(o).forEach(([k,v])=>{
          if(errorCode==="" && /error.?code|err.?code/i.test(k) && v!=null && String(v).trim()!=="") errorCode=String(v);
          if(!orderId && /order.?id/i.test(k) && realId(v)) orderId=String(v);
          if(v&&typeof v==="object") walk(v);
        });
      };
      walk(x);
    } catch(e) {
      const a=text.match(/["']error.?code["']\s*:\s*["']?([^,"'}\s]+)["']?/i);
      const b=text.match(/["']order.?id["']\s*:\s*["']?([^,"'}\s]+)["']?/i);
      if(a) errorCode=a[1]; if(b&&realId(b[1])) orderId=b[1];
    }
    // فال‌بک عمومی: اگر مقدار به‌صورت رشته‌ی چسبیده مثل errorcode1009 برگردد (نه key:value)
    if(errorCode===""){
      const g=text.match(/error[_\s-]?code[^\d]{0,6}(\d{2,7})/i);
      if(g) errorCode=g[1];
    }
    return {errorCode,orderId};
  }

  const panel=document.createElement("div");
  panel.id="ot8";
  Object.assign(panel.style,{
    position:"fixed",top:"15px",right:"15px",zIndex:"2147483647",
    width:"1100px",maxWidth:"calc(100vw - 30px)",maxHeight:"92vh",
    overflow:"auto",background:"#151515",color:"#eee",padding:"12px",
    border:"2px solid #555",borderRadius:"10px",boxShadow:"0 8px 35px #000",
    font:"12px Arial"
  });

  panel.innerHTML=`
  <div id="ot8head" style="display:flex;justify-content:space-between;cursor:move;padding:5px">
    <b style="font-size:18px">Order Timer v13 (debug scheduling) — Debug / تطبیق Request↔Response</b>
    <button id="ot8x">×</button>
  </div>

  <div style="border:1px solid #555;padding:10px;margin:8px 0;border-radius:6px">
    <b>🧪 Debug پشت‌سرهم</b><br><br>
    تعداد:
    <input id="dc" type="number" value="5" min="1" max="100" style="width:65px">
    فاصله:
    <input id="di" type="number" value="300" min="0" max="60000" style="width:80px"> ms
    <br><br>
    ساعت شروع:
    <input id="dstart" placeholder="08:44:59.000" style="width:120px;padding:4px">
    ساعت پایان:
    <input id="dend" placeholder="08:45:05.000" style="width:120px;padding:4px">
    <span style="color:#aaa">(خالی = همین الان / فقط با تعداد)</span>
    <br><br>
    <button id="ds">🧪 ارسال Debug</button>
    <button id="dx">■ توقف Debug</button>
    <span id="dst" style="margin-left:10px">آماده</span>
  </div>

  <div style="border:1px solid #555;padding:10px;margin:8px 0;border-radius:6px">
    <b>⏱ پنج زمان اصلی</b>
    <div id="ins" style="margin-top:8px"></div>
    <button id="start">▶ شروع</button>
    <button id="stop">■ توقف</button>
    <button id="clear">پاک کردن</button>
  </div>

  <div id="st" style="padding:8px;background:#252525;border-radius:5px">آماده</div>

  <div style="overflow:auto;margin-top:8px">
  <table style="border-collapse:collapse;width:100%;min-width:1050px">
    <thead><tr>
      <th>ردیف</th><th>نوع</th><th>هدف</th><th>کلیک</th><th>Request</th>
      <th>Response</th><th>مدت</th><th>HTTP</th><th>errorCode</th><th>orderId</th>
    </tr></thead>
    <tbody id="tb"></tbody>
  </table></div>

  <div style="margin-top:8px"><b>آخرین Response Text</b>
  <pre id="rt" style="white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto;background:#080808;padding:8px"></pre></div>`;

  document.body.appendChild(panel);

  const ins=panel.querySelector("#ins"), tb=panel.querySelector("#tb"),
        st=panel.querySelector("#st"), rt=panel.querySelector("#rt");

  for(let i=1;i<=5;i++){
    const d=document.createElement("div");
    d.style.marginBottom="6px";
    d.innerHTML=`<b style="display:inline-block;width:25px">${i}</b>
      <input id="t${i}" placeholder="08:44:59.400" style="width:145px;padding:5px">
      <span id="ts${i}"></span>`;
    ins.appendChild(d);
  }

  function render(){
    tb.innerHTML="";
    S.rows.forEach(r=>{
      const tr=document.createElement("tr");
      [r.no,r.type,r.target,r.click,r.request,r.response,
       r.duration?`${r.duration} ms`:"",r.http,r.errorCode,r.orderId].forEach(v=>{
        const td=document.createElement("td");
        td.textContent=v||"";
        td.style.cssText="border:1px solid #444;padding:5px;vertical-align:top";
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  function newRow(type,no){
    const r={no,type,target:"",click:"",request:"",response:"",
      duration:"",http:"",errorCode:"",orderId:"",responseText:"",
      requestSeen:false,responseSeen:false,clickMs:0};
    S.rows.push(r); return r;
  }

  // مدل جدید تطبیق: بلافاصله بعد از هر کلیک، همان row به‌عنوان «تک‌جای در انتظار» ثبت می‌شود.
  // اولین Requestِ مطابق (fetch/XHR) که برسد همان را کلایم و بلافاصله خالی می‌کند؛
  // هر Request دیگری که بعداً با همان الگوی URL برسد (مثلاً polling/status) دیگر جایی برای کلایم پیدا نمی‌کند
  // و نادیده گرفته می‌شود — این دقیقاً همان چیزی است که باعث در هم ریختن ردیف‌ها می‌شد.
  const CLAIM_WINDOW_MS = 4000; // حداکثر فاصله‌ی مجاز بین کلیک و شروع Request مرتبط با آن

  function markPending(r){
    S.pendingRow = r;
    S.pendingSince = r.clickMs || Date.now();
  }

  function claimForRequest(){
    const r = S.pendingRow;
    if(!r || r.requestSeen){ S.pendingRow=null; return null; }
    if(Date.now()-S.pendingSince > CLAIM_WINDOW_MS){ S.pendingRow=null; return null; }
    S.pendingRow = null;
    return r;
  }

  function finish(r,started,status,text){
    if(!r || r.responseSeen) return;
    const now=new Date();
    const x=info(text||"");
    r.response=time(now);
    r.duration=now.getTime()-started.getTime();
    r.http=String(status??"");
    r.errorCode=x.errorCode;
    r.orderId=x.orderId;
    r.responseText=text||"";
    r.responseSeen=true;
    render();
    rt.textContent=r.responseText||"(بدون متن Response)";

    console.log("OT8 RESPONSE",{
      row:r.no,type:r.type,request:r.request,response:r.response,
      durationMs:r.duration,http:r.http,errorCode:r.errorCode,
      orderId:r.orderId,responseText:r.responseText
    });

    if(r.type==="SCHEDULED" && realId(r.orderId)){
      S.stopped=true;
      S.timers.forEach(clearTimeout); S.timers=[];
      st.textContent="✓ سفارش ثبت شد — orderId: "+r.orderId+" — کلیک‌های بعدی متوقف شدند";
    }
  }

  // FETCH: Response همیشه به همان fetch invocation وصل است.
  const oldFetch=window.fetch;
  window.fetch=async function(...args){
    let url="", method="GET";
    try{
      url=typeof args[0]==="string"?args[0]:(args[0]?.url||"");
      method=(args[1]&&args[1].method)||(args[0]&&args[0].method)||"GET";
    }catch(e){}
    if(!String(url).includes("/api/v1/order")) return oldFetch.apply(this,args);

    console.log("OT8 MATCH(fetch)",method,url);

    const started=new Date(), r=claimForRequest();
    if(r){r.requestSeen=true;r.request=time(started);render();}

    try{
      const res=await oldFetch.apply(this,args);
      let text="";
      try{text=await res.clone().text()}catch(e){text="[Response Text unavailable: "+e.message+"]"}
      const opaque = res.type==="opaque"||res.type==="opaqueredirect";
      const httpVal = opaque ? "0 (opaque — بدنه‌ی واقعی به اسکریپت نمی‌رسد)" : res.status;
      finish(r,started,httpVal,text);
      return res;
    }catch(e){
      finish(r,started,"FETCH_ERROR",String(e?.message||e));
      throw e;
    }
  };

  // XHR: Response همیشه به همان XHR object وصل است.
  const X=window.XMLHttpRequest, oldOpen=X.prototype.open, oldSend=X.prototype.send;
  X.prototype.open=function(method,url,...rest){
    this.__ot8order=String(url||"").includes("/api/v1/order");
    this.__ot8method=method; this.__ot8url=url;
    return oldOpen.call(this,method,url,...rest);
  };
  X.prototype.send=function(...args){
    if(!this.__ot8order) return oldSend.apply(this,args);
    console.log("OT8 MATCH(xhr)",this.__ot8method,this.__ot8url);
    const xhr=this, started=new Date(), r=claimForRequest();
    if(r){r.requestSeen=true;r.request=time(started);render();}

    // به‌جای صبر برای loadend، همون لحظه‌ی load/error/timeout می‌خونیم —
    // چون اگه سایت بعداً (برای هر دلیلی، مثلاً client-side timeout) خودش abort() کنه،
    // status رو صفر می‌کنه؛ ولی load/error زودتر از اون اتفاق می‌افتن و مقدار واقعی رو دارن.
    let captured=false;
    const capture=()=>{
      if(captured) return; captured=true;
      let text="";
      try{text=xhr.responseText||""}catch(e){text="[Response Text unavailable: "+e.message+"]"}
      const httpVal = xhr.status===0
        ? "0 (بدون پاسخ واقعی — Cross-Origin/Blocked/Aborted؟)"
        : xhr.status;
      finish(r,started,httpVal,text);
    };
    xhr.addEventListener("load",capture,{once:true});
    xhr.addEventListener("error",capture,{once:true});
    xhr.addEventListener("timeout",capture,{once:true});
    xhr.addEventListener("abort",capture,{once:true});
    return oldSend.apply(this,args);
  };

  // زمان‌بندی اصلی
  panel.querySelector("#start").onclick=()=>{
    S.timers.forEach(clearTimeout); S.timers=[]; S.stopped=false;
    S.rows=[]; S.no=1; rt.textContent="";
    for(let i=1;i<=5;i++) panel.querySelector("#ts"+i).textContent="";

    let n=0;
    for(let i=1;i<=5;i++){
      const input=panel.querySelector("#t"+i), v=input.value.trim(), hint=panel.querySelector("#ts"+i);
      if(!v) continue;
      const target=parse(v);
      if(!target){hint.textContent=" ❌ فرمت اشتباه";continue;}
      const delay=target.getTime()-Date.now();
      if(delay<0){hint.textContent=" ❌ گذشته";continue;}

      const r=newRow("SCHEDULED",S.no++);
      r.target=v;

      const timer=setTimeout(()=>{
        if(S.stopped)return;
        const b=document.querySelector(".buy-btn"), now=new Date();
        if(!b){r.click=time(now);r.clickMs=now.getTime();r.http="BUY_BTN_NOT_FOUND";render();return;}
        // مهم: باید قبل از click() علامت بزنیم، چون سایت (Angular) ممکنه XHR رو
        // به‌صورت sync همون لحظه‌ی click() بفرسته — اگه بعدش علامت بزنیم، دیر شده.
        r.click=time(now);r.clickMs=now.getTime();
        markPending(r);
        b.click();
        hint.textContent=" ✓"; render();
        console.log("OT8 CLICK",r.no,r.target,r.click);
      },delay);
      S.timers.push(timer); n++;
    }
    render();
    st.textContent=n?`${n} کلیک برنامه‌ریزی شد`:"زمان معتبر وارد نشده";
  };

  panel.querySelector("#stop").onclick=()=>{
    S.stopped=true; S.timers.forEach(clearTimeout); S.timers=[];
    st.textContent="توقف دستی";
  };

  // Debug: هر Debug click یک row مستقل دارد.
  panel.querySelector("#ds").onclick=()=>{
    S.debugTimers.forEach(clearTimeout); S.debugTimers=[];
    const dst=panel.querySelector("#dst");
    const count=Math.max(1,Math.min(100,+panel.querySelector("#dc").value||1));
    const gv=parseFloat(panel.querySelector("#di").value), gap=isNaN(gv)?300:Math.max(0,gv);
    const sv=panel.querySelector("#dstart").value.trim();
    const ev=panel.querySelector("#dend").value.trim();

    let startMs=Date.now(), endMs=null;
    if(sv){
      const d=parse(sv);
      if(!d){dst.textContent="❌ فرمت ساعت شروع اشتباه";return;}
      startMs=d.getTime();
    }
    if(ev){
      const d=parse(ev);
      if(!d){dst.textContent="❌ فرمت ساعت پایان اشتباه";return;}
      endMs=d.getTime();
      if(endMs<=Date.now()){dst.textContent="❌ ساعت پایان گذشته است";return;}
      if(endMs<=startMs){dst.textContent="❌ ساعت پایان باید بعد از شروع باشد";return;}
    }
    // اگر ساعت شروع گذشته بود، از همین الان شروع می‌کنیم
    const base=Math.max(startMs,Date.now());

    // لیست زمان کلیک‌ها: اگر پایان داده شده تا همان ساعت (حداکثر ۲۰۰۰ کلیک)، وگرنه به‌اندازه‌ی «تعداد»
    const times=[];
    for(let i=0;;i++){
      const t=base+i*gap;
      if(endMs!==null){ if(t>endMs||i>=2000) break; }
      else if(i>=count) break;
      times.push(t);
    }
    dst.textContent=endMs!==null
      ? `${times.length} کلیک از ${time(new Date(base))} تا ${time(new Date(endMs))} (هر ${gap}ms)`
      : `${times.length} کلیک با فاصله ${gap}ms از ${time(new Date(base))}`;

    times.forEach((t,i)=>{
      const timer=setTimeout(()=>{
        const b=document.querySelector(".buy-btn"), now=new Date();
        const r=newRow("DEBUG","D"+i+"-"+Date.now());
        r.target=time(new Date(t));
        if(!b){r.click=time(now);r.clickMs=now.getTime();r.http="BUY_BTN_NOT_FOUND";render();return;}
        r.click=time(now);r.clickMs=now.getTime();
        markPending(r);
        b.click();
        render();
        console.log("OT8 DEBUG CLICK",r.no,r.click);
        if(i===times.length-1) dst.textContent="✓ Debug تمام شد";
      },Math.max(0,t-Date.now()));
      S.debugTimers.push(timer);
    });
  };

  panel.querySelector("#dx").onclick=()=>{
    S.debugTimers.forEach(clearTimeout);S.debugTimers=[];panel.querySelector("#dst").textContent="Debug متوقف شد";
  };

  panel.querySelector("#clear").onclick=()=>{
    S.timers.forEach(clearTimeout);S.debugTimers.forEach(clearTimeout);
    S.timers=[];S.debugTimers=[];S.rows=[];render();rt.textContent="";st.textContent="پاک شد";
  };

  // Drag
  const head=panel.querySelector("#ot8head"); let drag=false,ox=0,oy=0;
  head.onmousedown=e=>{
    if(e.target.closest("button"))return;
    const r=panel.getBoundingClientRect();drag=true;ox=e.clientX-r.left;oy=e.clientY-r.top;
    panel.style.right="auto";panel.style.left=r.left+"px";panel.style.top=r.top+"px";e.preventDefault();
  };
  const move=e=>{
    if(!drag)return;
    panel.style.left=Math.max(0,Math.min(innerWidth-panel.offsetWidth,e.clientX-ox))+"px";
    panel.style.top=Math.max(0,Math.min(innerHeight-panel.offsetHeight,e.clientY-oy))+"px";
  };
  const up=()=>drag=false;
  document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);

  window.__ot8_cleanup=()=>{
    try{window.fetch=oldFetch}catch(e){}
    try{X.prototype.open=oldOpen;X.prototype.send=oldSend}catch(e){}
    document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up);
  };

  panel.querySelector("#ot8x").onclick=()=>{
    S.timers.forEach(clearTimeout);S.debugTimers.forEach(clearTimeout);
    window.__ot8_cleanup();panel.remove();
  };

  render();
  console.log("Order Timer v13 (debug scheduling) loaded.");
})();