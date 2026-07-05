import 'package:flutter/material.dart';

void main() => runApp(const CravesApp());

class CravesApp extends StatelessWidget {
  const CravesApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Craves',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xffF6B545)),
        useMaterial3: true,
        fontFamily: 'Roboto',
      ),
      home: const CustomerHome(),
    );
  }
}

class CustomerHome extends StatelessWidget {
  const CustomerHome({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfffffbf6),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Good morning 👋', style: TextStyle(color: Colors.brown)),
            const SizedBox(height: 6),
            const Text('What would you like to eat today?', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, height: 1.05)),
            const SizedBox(height: 20),
            TextField(decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: 'Search for dishes, cuisines...', filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none))),
            const SizedBox(height: 20),
            Container(padding: const EdgeInsets.all(22), decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xfffff0d1), Colors.white]), borderRadius: BorderRadius.circular(26)), child: const Text('Homemade meals made with love from trusted home chefs.', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            const SizedBox(height: 20),
            const Text('Categories', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
            const SizedBox(height: 12),
            Wrap(spacing: 10, runSpacing: 10, children: ['Breakfast','Lunch','Dinner','Snacks','Desserts'].map((e)=>Chip(label: Text(e), avatar: const Text('🍲'))).toList()),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(destinations: const [
        NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.restaurant_outlined), label: 'Chefs'),
        NavigationDestination(icon: Icon(Icons.shopping_bag_outlined), label: 'Orders'),
        NavigationDestination(icon: Icon(Icons.favorite_border), label: 'Favorites'),
        NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
      ]),
    );
  }
}
