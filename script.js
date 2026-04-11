/* text-behind-image */
'use strict';
(function(){
    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    if(typeof QU !== 'undefined') QU.init({ kofi: true, discover: true });
    
    const canvas=$('#effectCanvas'),ctx=canvas.getContext('2d');
    let img=null;
    $('#uploadImg').addEventListener('click',()=>$('#imgUpload').click());
    $('#imgUpload').addEventListener('change',e=>{if(e.target.files[0]){const i=new Image();i.onload=()=>{img=i;render();};i.src=URL.createObjectURL(e.target.files[0]);}});
    function render(){
        const w=canvas.width=800,h=canvas.height=500;
        ctx.fillStyle='#111';ctx.fillRect(0,0,w,h);
        // Draw text first (behind layer)
        const txt=$('#behindText').value||'HELLO';
        const fs=parseInt($('#textSize').value);
        ctx.font='bold '+fs+'px Impact,sans-serif';ctx.textAlign='center';ctx.fillStyle=$('#textColor').value;
        ctx.fillText(txt,w/2,h/2+fs/3);
        // Draw image on top
        if(img){const ar=img.width/img.height;let dw=w,dh=h;if(ar>w/h){dh=w/ar;}else{dw=h*ar;}ctx.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);}
    }
    ['#behindText','#textColor','#textSize'].forEach(s=>$(s).addEventListener('input',render));
    $('#saveFx').addEventListener('click',()=>{const a=document.createElement('a');a.download='text-behind.png';a.href=canvas.toDataURL();a.click();});
    render();

})();
