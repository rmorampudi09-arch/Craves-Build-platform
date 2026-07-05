import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChefHat, Heart, Home, Search, ShoppingCart, User, Bell, Star } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1';

type Chef = { id:string; kitchenName:string; cuisine:string; rating:number; status:string };
type MenuItem = { id:string; name:string; description:string; price:number; category:string; isVeg:boolean; imageUrl:string };

function App(){
 const [chefs,setChefs]=useState<Chef[]>([]); const [menu,setMenu]=useState<MenuItem[]>([]); const [cart,setCart]=useState<MenuItem[]>([]);
 useEffect(()=>{ fetch(`${API}/chefs`).then(r=>r.json()).then(setChefs); fetch(`${API}/menu`).then(r=>r.json()).then(setMenu); },[]);
 return <div className="phone-shell">
  <header className="topbar"><div><span className="pin">⌖</span> Hyderabad <b>▼</b><p>Good morning, Rohan 👋</p><h1>What would you like to eat today?</h1></div><Bell size={22}/></header>
  <section className="search"><Search size={18}/><input placeholder="Search for dishes, cuisines..."/><button>⚙</button></section>
  <section className="hero"><div><b>Homemade meals made with love</b><p>Fresh food from trusted home chefs.</p><button>Explore Now</button></div></section>
  <section><div className="row"><h2>Categories</h2><a>View all</a></div><div className="chips">{['Breakfast','Lunch','Dinner','Snacks','Desserts'].map(x=><div className="chip" key={x}>🍲<span>{x}</span></div>)}</div></section>
  <section><div className="row"><h2>Top Picks For You</h2><a>View all</a></div><div className="cards">{menu.map(m=><article className="food" key={m.id}><img src={m.imageUrl}/><button className="heart"><Heart size={16}/></button><h3>{m.name}</h3><p>{m.description}</p><b>₹{m.price}</b><button onClick={()=>setCart([...cart,m])}>Add</button></article>)}</div></section>
  <section><div className="row"><h2>All Chefs</h2><a>Near me</a></div>{chefs.map(c=><div className="chef" key={c.id}><div className="avatar"><ChefHat/></div><div><b>{c.kitchenName}</b><p>{c.cuisine}</p><span><Star size={14}/> {c.rating} • 25–30 min</span></div><Heart size={18}/></div>)}</section>
  <footer className="nav"><Home/><ChefHat/><ShoppingCart/><Heart/><User/><span className="badge">{cart.length}</span></footer>
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>);
