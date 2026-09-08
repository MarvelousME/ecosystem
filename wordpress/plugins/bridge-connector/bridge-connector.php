<?php
/**
 * Plugin Name: Bridge Connector
 * Description: Connects a tenant WordPress application to the Bridge Ecosystem capability plane.
 * Version: 1.0.0
 * Requires PHP: 8.1
 */
declare(strict_types=1);
if(!defined('ABSPATH'))exit;
add_action('rest_api_init',function(){register_rest_route('bridge-connector/v1','/health',['methods'=>'GET','permission_callback'=>'__return_true','callback'=>fn()=>['status'=>'healthy','wordpress'=>get_bloginfo('version')]]);register_rest_route('bridge-connector/v1','/pages',['methods'=>'GET','permission_callback'=>fn()=>current_user_can('edit_pages'),'callback'=>function(){return array_map(fn($p)=>['id'=>$p->ID,'title'=>$p->post_title,'status'=>$p->post_status],get_pages(['post_status'=>['publish','draft','private']]));}]);});
