import {initMypage} from './mypage-v2-preview.js';
const root=document.querySelector('.mypage-v2[data-customize]');
if(root){
 if(root.dataset.live==='true')import('./mypage-live.js').then(({initializeLiveMypage})=>initializeLiveMypage(root));
 else initMypage(root);
}
