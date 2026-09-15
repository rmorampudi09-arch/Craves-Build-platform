package in.craves.integration.referrals.checkout;
import java.math.BigInteger;
import java.util.*;
/** Exact paise, deterministic across retries; each child is capped by its original gross amount. */
public final class ReferralTenderAllocation {
    public record Child(UUID id,long grossPaise,long foodPaise) {}
    public record Allocation(UUID id,long grossPaise,long walletPaise,long discountPaise,long gatewayPaise) {}
    public static List<Allocation> allocate(List<Child> input,long wallet,long discount){
        if(input==null || input.isEmpty() || input.size()>100 || wallet<0 || discount<0)throw new IllegalArgumentException("Invalid checkout funding");
        var children=input.stream().sorted(Comparator.comparing(c->c.id().toString())).toList();var seen=new HashSet<UUID>();long gross=0,food=0;
        for(var c:children){if(c.id()==null || !seen.add(c.id()) || c.grossPaise()<0 || c.foodPaise()<0 || c.foodPaise()>c.grossPaise())throw new IllegalArgumentException("Invalid child amount");gross=Math.addExact(gross,c.grossPaise());food=Math.addExact(food,c.foodPaise());}
        if(gross<=0 || discount>food || wallet>gross-discount)throw new IllegalArgumentException("Benefits exceed original checkout");
        long[] coupons=split(discount,children.stream().mapToLong(Child::foodPaise).toArray());long[] capacity=new long[children.size()];for(int i=0;i<capacity.length;i++)capacity[i]=children.get(i).grossPaise()-coupons[i];
        long[] credits=split(wallet,capacity);var result=new ArrayList<Allocation>();for(int i=0;i<capacity.length;i++)result.add(new Allocation(children.get(i).id(),children.get(i).grossPaise(),credits[i],coupons[i],capacity[i]-credits[i]));return List.copyOf(result);
    }
    private static long[] split(long amount,long[] weights){long total=0;for(long w:weights)total=Math.addExact(total,w);if(amount>total)throw new IllegalArgumentException("Insufficient allocation capacity");long[] result=new long[weights.length];if(amount==0)return result;long cumulative=0,prior=0;for(int i=0;i<weights.length;i++){cumulative=Math.addExact(cumulative,weights[i]);long next=BigInteger.valueOf(amount).multiply(BigInteger.valueOf(cumulative)).divide(BigInteger.valueOf(total)).longValueExact();result[i]=next-prior;prior=next;}return result;}
}
