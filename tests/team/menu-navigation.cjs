// Use the actual navigation instead of redundant buttons inside page content.
module.exports=async function goMenu(page,view){
 const toggle=page.locator('#app-menu-toggle');
 const target=page.locator('[data-action=nav][data-view="'+view+'"]');
 if(!await target.isVisible()&&await toggle.isVisible())await toggle.click();
 await target.click();
};
