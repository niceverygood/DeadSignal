const skills={
  'fire-throw':{title:'화염병',subtitle:'MOLOTOV BREAK',accent:'#ffc76a'},
  lure:{title:'소음탄',subtitle:'SIGNAL DECOY',accent:'#a1d9da'},
  dash:{title:'긴급 회피',subtitle:'EVASION DRIVE',accent:'#e5d5a1'},
};
export function createSkillCutin(portrait){
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./skill-cutin.css',import.meta.url).href;document.head.append(link);
  const panel=document.createElement('div');panel.className='skill-cutin';panel.setAttribute('aria-hidden','true');
  panel.innerHTML='<div class="skill-cutin-speed"></div><div class="skill-cutin-flash"></div><img alt=""><div class="skill-cutin-copy"><span>SURVIVOR / SPECIAL ACTION</span><strong></strong><em></em></div>';
  document.body.append(panel);panel.addEventListener('animationend',event=>{if(event.target===panel)panel.classList.remove('active');});
  return {play(type){const skill=skills[type];if(!skill)return;
    const source=portrait?.();if(source)try{panel.querySelector('img').src=source.toDataURL('image/png');}catch{}
    panel.style.setProperty('--skill-accent',skill.accent);panel.querySelector('strong').textContent=skill.title;panel.querySelector('em').textContent=skill.subtitle;
    panel.classList.remove('active');void panel.offsetWidth;panel.classList.add('active');
  }};
}
